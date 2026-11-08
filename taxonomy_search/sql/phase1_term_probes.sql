-- Phase 1 ad-hoc probe (read-only): are the Phase 3 validation targets present in the data?
-- Rough regex counts only — they over/under-match and are NOT a classification.
-- Run:  psql -h localhost -d events_monitor_db -f sql/phase1_term_probes.sql

select term, count(*) as lots, count(distinct auction_id) as auctions
from (
    select auction_id, unnest(array[
        case when title_fr || ' ' || description_fr ~* '\m(chaussures?|escarpins?|bottes?|bottines?|mocassins?|baskets?|sandales?|souliers?)\M'
             then 'footwear (fr terms)' end,
        case when title_en || ' ' || description_en ~* '\m(shoes?|boots?|pumps|heels|loafers?|sneakers?|sandals?)\M'
             then 'footwear (en terms)' end,
        case when title_fr || ' ' || description_fr ~* 'louis\s*xiv' then 'Louis XIV (fr text)' end,
        case when title_fr || ' ' || description_fr ~* '(style|go[uû]t)\s+louis\s*xiv' then 'style Louis XIV (fr)' end,
        case when title_fr || ' ' || description_fr ~* '[ée]poque\s+louis\s*xiv' then 'époque Louis XIV (fr)' end,
        case when title_fr || ' ' || description_fr ~* 'boulle' then 'Boulle (fr text)' end,
        case when title_fr || ' ' || description_fr ~* '\mXVIII(e|è|ème)?\s+si[eè]cle' then 'XVIIIe siècle (fr)' end
    ]) as term
    from drouot_collector.lots
) x
where term is not null
group by term
order by term;

-- Lots in the source category for shoes.
select category_fr, category_en, count(*) from drouot_collector.lots
where category_en in ('Shoes', 'Clothes', 'Fashion and vintage items', 'Handbags')
group by 1, 2 order by 3 desc;
