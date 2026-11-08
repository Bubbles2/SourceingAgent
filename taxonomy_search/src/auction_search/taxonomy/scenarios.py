"""Phase 2 validation scenarios: can the schema represent synonyms, translations, hierarchy and
historical associations without conflating them — and does PostgreSQL reject invalid data?

Runs against a schema that has been migrated and loaded with the example seed (normally the
rolled-back sandbox). Two real lots are read from the source schema to show how lot assertions keep
"made in the Louis XIV period" apart from "in Louis XIV style"; the rows written for them are
rolled back with the sandbox.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from auction_search.database.inspection import StructureReport
from auction_search.taxonomy.store import TaxonomyStore

log = logging.getLogger(__name__)

FOOTWEAR_TYPES = {
    "fashion.footwear.boots", "fashion.footwear.ankle_boots", "fashion.footwear.high_heels",
    "fashion.footwear.pumps", "fashion.footwear.loafers", "fashion.footwear.sneakers", "fashion.footwear.sandals",
}


@dataclass
class ExampleLot:
    lot_id: int
    source: str
    source_lot_id: str
    title_fr: str


@dataclass
class ScenarioResult:
    group: str
    name: str
    status: str  # passed | failed | skipped
    detail: str


def _q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def find_example_lots(store: TaxonomyStore, structure: StructureReport) -> dict[str, ExampleLot | None]:
    """Pick one real lot 'in Louis XIV style' made in the 19th century, and one 'of the Louis XIV period'."""
    m = structure.mapping
    if m is None:
        return {"style": None, "period": None}
    lots_info = next(t for t in structure.tables if t.name == m.lots.table)
    pk = m.lots.primary_key[0]
    business = next((u["columns"] for u in lots_info.unique_constraints), [pk])
    source_cols = set(m.lots.names("source"))
    source_col = next((c for c in business if c in source_cols), None)  # type: ignore[union-attr]
    id_col = next(c for c in business if c != source_col)  # type: ignore[union-attr]
    title = m.lots.by_language("title").get("fr")
    desc = m.lots.by_language("description").get("fr")
    if not (title and desc):
        return {"style": None, "period": None}
    body = f"coalesce({_q(title)}, '') || ' ' || coalesce({_q(desc)}, '')"
    src = f"{_q(m.schema)}.{_q(m.lots.table)}"
    source_expr = _q(source_col) if source_col else "'unknown'"

    def first(condition: str) -> ExampleLot | None:
        row = store.conn.execute(text(
            f"select {_q(pk)}, {source_expr}, {_q(id_col)}, {_q(title)} from {src} "
            f"where {condition} order by {_q(pk)} limit 1")).first()
        return ExampleLot(int(row[0]), str(row[1]), str(row[2]), str(row[3])) if row else None

    return {
        "style": first(f"{body} ~* '(style|go[uû]t)\\s+louis\\s*xiv' and {body} ~* '(XIXe|XIXème|19e|19ème)'"),
        "period": first(f"{body} ~* '[ée]poque\\s+louis\\s*xiv' and {body} ~* '\\mcommode'"),
    }


class ScenarioRunner:
    def __init__(self, store: TaxonomyStore, examples: dict[str, ExampleLot | None]) -> None:
        self.store = store
        self.conn = store.conn
        self.examples = examples
        self.results: list[ScenarioResult] = []

    # ---- helpers --------------------------------------------------------------------

    def check(self, group: str, name: str, fn: Callable[[], tuple[bool, str]]) -> None:
        # Each scenario runs in its own savepoint so an unexpected SQL error cannot poison the rest.
        savepoint = self.conn.begin_nested()
        try:
            ok, detail = fn()
            status = "passed" if ok else "failed"
            savepoint.commit()
        except Exception as exc:  # a scenario must never abort the run
            savepoint.rollback()
            status, detail = "failed", f"{type(exc).__name__}: {str(exc).splitlines()[0]}"
        self.results.append(ScenarioResult(group, name, status, detail))
        log.info("scenario", extra={"group": group, "scenario": name, "status": status})

    def rejected(self, group: str, name: str, sql: str, params: dict[str, object]) -> None:
        """Expect PostgreSQL to reject the statement; run it inside a savepoint."""
        def attempt() -> tuple[bool, str]:
            savepoint = self.conn.begin_nested()
            try:
                self.conn.execute(text(sql), params)
            except DBAPIError as exc:
                savepoint.rollback()
                diag = getattr(exc.orig, "diag", None)
                constraint = getattr(diag, "constraint_name", None) or type(exc.orig).__name__
                return True, f"rejected by {constraint}"
            savepoint.rollback()
            return False, "statement was accepted"
        self.check(group, name, attempt)

    def cid(self, key: str) -> int:
        cid = self.store.concept_id(key)
        if cid is None:
            raise LookupError(f"concept {key} not loaded")
        return cid

    def t(self, table: str) -> str:
        return self.store._t(table)

    def terms(self, term: str, language: str) -> list[dict[str, object]]:
        return self.store.find_terms(term, language)

    # ---- scenarios ------------------------------------------------------------------

    def run(self) -> list[ScenarioResult]:
        self._labels()
        self._hierarchy()
        self._associations()
        self._lot_assertions()
        self._constraints()
        self._versions()
        return self.results

    def _labels(self) -> None:
        g = "Synonyms and translations"

        def translation() -> tuple[bool, str]:
            fr, en = self.terms("Bottines", "fr"), self.terms("Ankle boots", "en")
            ok = (len(fr) == len(en) == 1 and fr[0]["concept_key"] == en[0]["concept_key"]
                  == "fashion.footwear.ankle_boots" and fr[0]["term_type"] == en[0]["term_type"] == "preferred")
            return ok, f"fr 'Bottines' → {[r['concept_key'] for r in fr]}; en 'Ankle boots' → {[r['concept_key'] for r in en]}"
        self.check(g, "Translation = preferred labels of ONE concept in two languages", translation)

        def synonym() -> tuple[bool, str]:
            rows = self.terms("Louis Quatorze style", "en")
            ok = [(r["concept_key"], r["term_type"]) for r in rows] == [("style.louis_xiv", "synonym")]
            return ok, f"'Louis Quatorze style' → {[(r['concept_key'], r['term_type']) for r in rows]}"
        self.check(g, "Synonym = another label of the same concept, same language", synonym)

        def variant() -> tuple[bool, str]:
            rows = self.terms("Buhl work", "en")
            ok = [(r["concept_key"], r["term_type"]) for r in rows] == [("technique.boulle_marquetry", "spelling_variant")]
            return ok, f"'Buhl work' → {[(r['concept_key'], r['term_type']) for r in rows]}"
        self.check(g, "Spelling variant kept apart from synonyms", variant)

        def accents() -> tuple[bool, str]:
            rows = self.terms("HERMES", "fr")
            return [r["concept_key"] for r in rows] == ["maker.hermes"], f"'HERMES' → {[r['term'] for r in rows]}"
        self.check(g, "Case and accents are normalised ('HERMES' finds 'Hermès')", accents)

        def false_friends() -> tuple[bool, str]:
            fr = [r["concept_key"] for r in self.terms("chandeliers", "fr")]
            en = [r["concept_key"] for r in self.terms("chandeliers", "en")]
            ok = fr == ["decorative_arts.lighting.candlesticks"] and en == ["decorative_arts.lighting.ceiling_lights"]
            return ok, f"fr 'chandeliers' → {fr}; en 'chandeliers' → {en}"
        self.check(g, "False friends resolved by language (fr chandelier = candlestick)", false_friends)

    def _hierarchy(self) -> None:
        g = "Parent-child hierarchy"

        def footwear() -> tuple[bool, str]:
            below = set(self.store.narrower("fashion.footwear"))
            return below == FOOTWEAR_TYPES, f"narrower(fashion.footwear) = {sorted(below)}"
        self.check(g, "Footwear expands to its 7 subtypes (transitively)", footwear)

        def ankle() -> tuple[bool, str]:
            up = self.store.ancestors("fashion.footwear.ankle_boots")
            return up == ["fashion.footwear.boots", "fashion.footwear", "fashion"], f"ancestors = {up}"
        self.check(g, "Ankle boots → boots → footwear → fashion", ankle)

        def century() -> tuple[bool, str]:
            below = set(self.store.narrower("period.18th_century"))
            ok = {"period.regence", "period.louis_xv", "period.louis_xvi"} <= below and "period.louis_xiv" not in below
            return ok, f"narrower(18th century) = {sorted(below)}"
        self.check(g, "18th century contains Régence/Louis XV/Louis XVI, not Louis XIV (1643–1715 spans two)", century)

    def _associations(self) -> None:
        g = "Historical associations are not synonyms"

        def distinct() -> tuple[bool, str]:
            p, s = self.store.describe("period.louis_xiv"), self.store.describe("style.louis_xiv")
            assert p and s
            pc, sc = p["concept"], s["concept"]
            shared = ({(t["language"], t["term"]) for t in p["terms"]} & {(t["language"], t["term"]) for t in s["terms"]})
            ok = pc["id"] != sc["id"] and (pc["dimension"], sc["dimension"]) == ("period", "style") and not shared
            return ok, (f"period.louis_xiv ({pc['start_year']}–{pc['end_year']}, dimension {pc['dimension']}) vs "
                        f"style.louis_xiv (dimension {sc['dimension']}); shared labels: {sorted(shared) or 'none'}")
        self.check(g, "Louis XIV period and Louis XIV style are separate concepts", distinct)

        def typed_link() -> tuple[bool, str]:
            rels = self.store.relationships_between("style.louis_xiv", "period.louis_xiv")
            no_path = ("period.louis_xiv" not in self.store.ancestors("style.louis_xiv")
                       and "style.louis_xiv" not in self.store.narrower("period.louis_xiv"))
            return rels == ["originated_in_period"] and no_path, f"links: {rels}; hierarchy path: {not no_path}"
        self.check(g, "Style→period link is 'originated_in_period' only (no hierarchy, no synonymy)", typed_link)

        def boulle() -> tuple[bool, str]:
            to_style = self.store.relationships_between("technique.boulle_marquetry", "style.louis_xiv")
            to_maker = self.store.relationships_between("technique.boulle_marquetry", "maker.andre_charles_boulle")
            ok = to_style == ["associated_technique"] and "named_after" in to_maker
            return ok, f"with style.louis_xiv: {to_style}; with maker: {to_maker}"
        self.check(g, "Boulle marquetry: associated technique of the style, named after A.-C. Boulle", boulle)

        def ambiguous() -> tuple[bool, str]:
            rows = self.terms("Boulle", "fr")
            ok = {r["concept_key"] for r in rows} == {"technique.boulle_marquetry", "maker.andre_charles_boulle"} and all(
                r["is_ambiguous"] for r in rows)
            return ok, f"'Boulle' (fr) → {[(r['concept_key'], 'ambiguous' if r['is_ambiguous'] else '') for r in rows]}"
        self.check(g, "Bare 'Boulle' is flagged ambiguous (technique or maker)", ambiguous)

        def revival() -> tuple[bool, str]:
            rels = self.store.relationships_between("style.napoleon_iii", "style.louis_xiv")
            return rels == ["revival_of"], f"style.napoleon_iii ↔ style.louis_xiv: {rels}"
        self.check(g, "Later Louis XIV-style work: Napoleon III style is a revival_of Louis XIV style", revival)

    def _insert_lot_concept(self, lot: ExampleLot, key: str, assertion: str, version_id: int) -> None:
        self.conn.execute(text(
            f"insert into {self.t('lot_concepts')} (lot_id, source, source_lot_id, concept_id, concept_dimension, "
            f"assertion, confidence, method, source_field, evidence, taxonomy_version_id) "
            f"select :lot, :src, :sid, id, dimension, :assertion, 0.9, 'manual', 'title_fr', "
            f"jsonb_build_object('quote', cast(:quote as text)), :vid "
            f"from {self.t('taxonomy_concepts')} where concept_key = :key"),
            {"lot": lot.lot_id, "src": lot.source, "sid": lot.source_lot_id, "assertion": assertion,
             "quote": lot.title_fr[:200], "vid": version_id, "key": key})

    def _lot_assertions(self) -> None:
        g = "Real lots: period vs style"
        style_lot, period_lot = self.examples.get("style"), self.examples.get("period")
        if not (style_lot and period_lot):
            self.results.append(ScenarioResult(g, "Example lots", "skipped", "matching lots not found in source"))
            return
        vid = int(self.conn.execute(text(f"select min(id) from {self.t('taxonomy_versions')}")).scalar_one())

        def record() -> tuple[bool, str]:
            self._insert_lot_concept(style_lot, "style.louis_xiv", "in_style_of", vid)
            self._insert_lot_concept(style_lot, "period.19th_century", "dated_to", vid)
            self._insert_lot_concept(period_lot, "period.louis_xiv", "dated_to", vid)
            self._insert_lot_concept(period_lot, "furniture.case_furniture.commodes", "classified_as", vid)
            return True, (f"lot {style_lot.lot_id} «{style_lot.title_fr[:70]}…» → in_style_of style.louis_xiv + "
                          f"dated_to period.19th_century; lot {period_lot.lot_id} «{period_lot.title_fr[:70]}…» → "
                          f"dated_to period.louis_xiv + classified_as commodes")
        self.check(g, "Assertions recorded for two real lots", record)

        def query(assertion: str, key: str) -> list[int]:
            return [r[0] for r in self.conn.execute(text(
                f"select lc.lot_id from {self.t('lot_concepts')} lc join {self.t('taxonomy_concepts')} c "
                f"on c.id = lc.concept_id where lc.assertion = :a and c.concept_key = :k order by 1"),
                {"a": assertion, "k": key})]

        def separated() -> tuple[bool, str]:
            dated, styled = query("dated_to", "period.louis_xiv"), query("in_style_of", "style.louis_xiv")
            ok = dated == [period_lot.lot_id] and styled == [style_lot.lot_id]
            return ok, f"dated_to Louis XIV period → {dated}; in_style_of Louis XIV → {styled}"
        self.check(g, "'Made in Louis XIV period' and 'in Louis XIV style' return different lots", separated)

        self.rejected(g, "A style concept cannot be used as a dating ('dated_to' style.louis_xiv)",
                      f"insert into {self.t('lot_concepts')} (lot_id, source, source_lot_id, concept_id, "
                      f"concept_dimension, assertion, confidence, method, taxonomy_version_id) "
                      f"values (:lot, :src, :sid, :cid, 'style', 'dated_to', 0.9, 'manual', :vid)",
                      {"lot": style_lot.lot_id, "src": style_lot.source, "sid": style_lot.source_lot_id,
                       "cid": self.cid("style.louis_xiv"), "vid": vid})

    def _constraints(self) -> None:
        g = "Database constraints reject invalid data"
        rel = self.t("taxonomy_relationships")
        vid = int(self.conn.execute(text(f"select min(id) from {self.t('taxonomy_versions')}")).scalar_one())
        cols = ("relationship_type, source_concept_id, source_dimension, target_concept_id, target_dimension, "
                "provenance, introduced_in_version_id")
        style, period = self.cid("style.louis_xiv"), self.cid("period.louis_xiv")

        self.rejected(g, "'broader' from a style to a period (not an allowed rule)",
                      f"insert into {rel} ({cols}) values ('broader', :s, 'style', :t, 'period', 'manual', :v)",
                      {"s": style, "t": period, "v": vid})
        self.rejected(g, "Relationship row lying about a concept's dimension",
                      f"insert into {rel} ({cols}) values ('broader', :s, 'period', :t, 'period', 'manual', :v)",
                      {"s": style, "t": period, "v": vid})
        self.rejected(g, "A concept related to itself",
                      f"insert into {rel} ({cols}) values ('related', :s, 'style', :s, 'style', 'manual', :v)",
                      {"s": style, "v": vid})
        hi, lo = sorted((self.cid("fashion.footwear.boots"), self.cid("fashion.footwear.sandals")), reverse=True)
        self.rejected(g, "Symmetric 'related' stored in non-canonical order",
                      f"insert into {rel} ({cols}) values ('related', :s, 'object_type', :t, 'object_type', 'manual', :v)",
                      {"s": hi, "t": lo, "v": vid})
        self.rejected(g, "Duplicate concept key",
                      f"insert into {self.t('taxonomy_concepts')} (concept_key, dimension, provenance, "
                      f"introduced_in_version_id) values ('style.louis_xiv', 'style', 'manual', :v)", {"v": vid})
        terms = self.t("taxonomy_terms")
        tcols = "concept_id, concept_dimension, language, term, normalized, term_type, provenance, introduced_in_version_id"
        self.rejected(g, "Second preferred label in the same language",
                      f"insert into {terms} ({tcols}) values (:c, 'style', 'en', 'Sun King style', 'sun king style', "
                      f"'preferred', 'manual', :v)", {"c": style, "v": vid})
        # A brand-new object type (so the only possible conflict is the shared preferred label).
        self.rejected(g, "Another object type reusing the preferred label 'Boots'",
                      f"with c as (insert into {self.t('taxonomy_concepts')} (concept_key, dimension, provenance, "
                      f"introduced_in_version_id) values ('fashion.footwear.test_only', 'object_type', 'manual', :v) "
                      f"returning id) insert into {terms} ({tcols}) "
                      f"select c.id, 'object_type', 'en', 'Boots', 'boots', 'preferred', 'manual', :v from c",
                      {"v": vid})
        self.rejected(g, "Evidence pointing at two things at once",
                      f"insert into {self.t('taxonomy_evidence')} (concept_id, term_id, extractor) "
                      f"values (:c, (select min(id) from {terms}), 'test')", {"c": style})
        self.rejected(g, "Confidence outside 0–1",
                      f"insert into {self.t('taxonomy_concepts')} (concept_key, dimension, provenance, confidence, "
                      f"introduced_in_version_id) values ('style.test_only', 'style', 'manual', 1.5, :v)", {"v": vid})

    def _versions(self) -> None:
        g = "Versions and publication"
        views = ("published_concepts", "published_terms", "published_relationships")

        def counts() -> dict[str, int]:
            return {v: int(self.conn.execute(text(f"select count(*) from {self.t(v)}")).scalar_one()) for v in views}

        def draft_hidden() -> tuple[bool, str]:
            c = counts()
            return all(n == 0 for n in c.values()), f"while draft: {c}"
        self.check(g, "Nothing is visible to search while the version is a draft", draft_hidden)

        def published() -> tuple[bool, str]:
            label = self.conn.execute(text(f"select label from {self.t('taxonomy_versions')} order by id limit 1")).scalar_one()
            for table in ("taxonomy_concepts", "taxonomy_terms", "taxonomy_relationships"):
                self.conn.execute(text(f"update {self.t(table)} set review_status = 'approved'"))
            self.store.publish_version(label)
            c = counts()
            total = int(self.conn.execute(text(f"select count(*) from {self.t('taxonomy_concepts')}")).scalar_one())
            return c["published_concepts"] == total > 0, f"after approve + publish: {c}"
        self.check(g, "After approval and publication the views expose the version", published)

        self.rejected(g, "Two published versions at once",
                      f"insert into {self.t('taxonomy_versions')} (label, status) values ('second', 'published')", {})
