BEGIN;

create schema if not exists "auction_search";

CREATE TABLE auction_search.alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001

CREATE TABLE auction_search.taxonomy_dimensions (
    code TEXT NOT NULL, 
    label_en TEXT NOT NULL, 
    label_fr TEXT NOT NULL, 
    description TEXT NOT NULL, 
    CONSTRAINT pk_taxonomy_dimensions PRIMARY KEY (code)
);

CREATE TABLE auction_search.taxonomy_term_types (
    code TEXT NOT NULL, 
    description TEXT NOT NULL, 
    CONSTRAINT pk_taxonomy_term_types PRIMARY KEY (code)
);

CREATE TABLE auction_search.taxonomy_relationship_types (
    code TEXT NOT NULL, 
    label_en TEXT NOT NULL, 
    inverse_label_en TEXT NOT NULL, 
    is_hierarchical BOOLEAN NOT NULL, 
    is_symmetric BOOLEAN NOT NULL, 
    is_transitive BOOLEAN NOT NULL, 
    expansion_weight NUMERIC(3, 2) NOT NULL, 
    description TEXT NOT NULL, 
    CONSTRAINT pk_taxonomy_relationship_types PRIMARY KEY (code)
);

CREATE TABLE auction_search.taxonomy_relationship_rules (
    relationship_type TEXT NOT NULL, 
    source_dimension TEXT NOT NULL, 
    target_dimension TEXT NOT NULL, 
    CONSTRAINT pk_taxonomy_relationship_rules PRIMARY KEY (relationship_type, source_dimension, target_dimension), 
    CONSTRAINT fk_taxonomy_relationship_rules_relationship_type_taxono_4c42 FOREIGN KEY(relationship_type) REFERENCES auction_search.taxonomy_relationship_types (code), 
    CONSTRAINT fk_taxonomy_relationship_rules_source_dimension_taxonom_f0c3 FOREIGN KEY(source_dimension) REFERENCES auction_search.taxonomy_dimensions (code), 
    CONSTRAINT fk_taxonomy_relationship_rules_target_dimension_taxonom_7248 FOREIGN KEY(target_dimension) REFERENCES auction_search.taxonomy_dimensions (code)
);

CREATE TABLE auction_search.lot_assertion_rules (
    assertion TEXT NOT NULL, 
    dimension TEXT NOT NULL, 
    CONSTRAINT pk_lot_assertion_rules PRIMARY KEY (assertion, dimension), 
    CONSTRAINT fk_lot_assertion_rules_dimension_taxonomy_dimensions FOREIGN KEY(dimension) REFERENCES auction_search.taxonomy_dimensions (code)
);

CREATE TABLE auction_search.taxonomy_versions (
    id INTEGER GENERATED ALWAYS AS IDENTITY, 
    label TEXT NOT NULL, 
    status TEXT DEFAULT 'draft' NOT NULL, 
    description TEXT, 
    parent_version_id INTEGER, 
    created_by TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    published_at TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_taxonomy_versions PRIMARY KEY (id), 
    CONSTRAINT ck_taxonomy_versions_status CHECK (status in ('draft', 'published', 'retired')), 
    CONSTRAINT uq_taxonomy_versions_label UNIQUE (label), 
    CONSTRAINT fk_taxonomy_versions_parent_version_id_taxonomy_versions FOREIGN KEY(parent_version_id) REFERENCES auction_search.taxonomy_versions (id)
);

CREATE UNIQUE INDEX uq_taxonomy_versions_one_published ON auction_search.taxonomy_versions (status) WHERE status = 'published';

CREATE TABLE auction_search.taxonomy_concepts (
    id BIGINT GENERATED ALWAYS AS IDENTITY, 
    concept_key TEXT NOT NULL, 
    dimension TEXT NOT NULL, 
    start_year INTEGER, 
    end_year INTEGER, 
    scope_notes JSONB DEFAULT '{}'::jsonb NOT NULL, 
    attributes JSONB DEFAULT '{}'::jsonb NOT NULL, 
    review_status TEXT DEFAULT 'candidate' NOT NULL, 
    confidence NUMERIC(4, 3) DEFAULT 1 NOT NULL, 
    provenance TEXT NOT NULL, 
    introduced_in_version_id INTEGER NOT NULL, 
    retired_in_version_id INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_taxonomy_concepts PRIMARY KEY (id), 
    CONSTRAINT ck_taxonomy_concepts_concept_key_format CHECK (concept_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'), 
    CONSTRAINT ck_taxonomy_concepts_year_order CHECK (start_year is null or end_year is null or start_year <= end_year), 
    CONSTRAINT ck_taxonomy_concepts_scope_notes_object CHECK (jsonb_typeof(scope_notes) = 'object'), 
    CONSTRAINT ck_taxonomy_concepts_attributes_object CHECK (jsonb_typeof(attributes) = 'object'), 
    CONSTRAINT ck_taxonomy_concepts_confidence_range CHECK (confidence >= 0 and confidence <= 1), 
    CONSTRAINT ck_taxonomy_concepts_review_status CHECK (review_status in ('candidate', 'approved', 'rejected')), 
    CONSTRAINT ck_taxonomy_concepts_provenance CHECK (provenance in ('seed', 'source_category', 'rule_extraction', 'ai_extraction', 'manual', 'search_feedback')), 
    CONSTRAINT ck_taxonomy_concepts_retired_after CHECK (retired_in_version_id is null or retired_in_version_id > introduced_in_version_id), 
    CONSTRAINT uq_taxonomy_concepts_id_dimension UNIQUE (id, dimension), 
    CONSTRAINT uq_taxonomy_concepts_concept_key UNIQUE (concept_key), 
    CONSTRAINT fk_taxonomy_concepts_dimension_taxonomy_dimensions FOREIGN KEY(dimension) REFERENCES auction_search.taxonomy_dimensions (code), 
    CONSTRAINT fk_taxonomy_concepts_introduced_in_version_id_taxonomy_versions FOREIGN KEY(introduced_in_version_id) REFERENCES auction_search.taxonomy_versions (id), 
    CONSTRAINT fk_taxonomy_concepts_retired_in_version_id_taxonomy_versions FOREIGN KEY(retired_in_version_id) REFERENCES auction_search.taxonomy_versions (id)
);

CREATE INDEX ix_taxonomy_concepts_dimension ON auction_search.taxonomy_concepts (dimension);

CREATE TABLE auction_search.taxonomy_terms (
    id BIGINT GENERATED ALWAYS AS IDENTITY, 
    concept_id BIGINT NOT NULL, 
    concept_dimension TEXT NOT NULL, 
    language TEXT NOT NULL, 
    term TEXT NOT NULL, 
    normalized TEXT NOT NULL, 
    term_type TEXT NOT NULL, 
    is_ambiguous BOOLEAN DEFAULT false NOT NULL, 
    review_status TEXT DEFAULT 'candidate' NOT NULL, 
    confidence NUMERIC(4, 3) DEFAULT 1 NOT NULL, 
    provenance TEXT NOT NULL, 
    introduced_in_version_id INTEGER NOT NULL, 
    retired_in_version_id INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_taxonomy_terms PRIMARY KEY (id), 
    CONSTRAINT fk_taxonomy_terms_concept_id_concept_dimension_taxonomy_695e FOREIGN KEY(concept_id, concept_dimension) REFERENCES auction_search.taxonomy_concepts (id, dimension) ON UPDATE CASCADE, 
    CONSTRAINT ck_taxonomy_terms_language_code CHECK (language ~ '^[a-z]{2,3}$'), 
    CONSTRAINT ck_taxonomy_terms_term_not_blank CHECK (btrim(term) <> ''), 
    CONSTRAINT ck_taxonomy_terms_normalized_not_blank CHECK (normalized <> ''), 
    CONSTRAINT ck_taxonomy_terms_confidence_range CHECK (confidence >= 0 and confidence <= 1), 
    CONSTRAINT ck_taxonomy_terms_review_status CHECK (review_status in ('candidate', 'approved', 'rejected')), 
    CONSTRAINT ck_taxonomy_terms_provenance CHECK (provenance in ('seed', 'source_category', 'rule_extraction', 'ai_extraction', 'manual', 'search_feedback')), 
    CONSTRAINT ck_taxonomy_terms_retired_after CHECK (retired_in_version_id is null or retired_in_version_id > introduced_in_version_id), 
    CONSTRAINT uq_taxonomy_terms_concept_id_language_normalized UNIQUE (concept_id, language, normalized), 
    CONSTRAINT fk_taxonomy_terms_term_type_taxonomy_term_types FOREIGN KEY(term_type) REFERENCES auction_search.taxonomy_term_types (code), 
    CONSTRAINT fk_taxonomy_terms_introduced_in_version_id_taxonomy_versions FOREIGN KEY(introduced_in_version_id) REFERENCES auction_search.taxonomy_versions (id), 
    CONSTRAINT fk_taxonomy_terms_retired_in_version_id_taxonomy_versions FOREIGN KEY(retired_in_version_id) REFERENCES auction_search.taxonomy_versions (id)
);

CREATE INDEX ix_taxonomy_terms_normalized ON auction_search.taxonomy_terms (normalized);

CREATE UNIQUE INDEX uq_taxonomy_terms_one_preferred ON auction_search.taxonomy_terms (concept_id, language) WHERE term_type = 'preferred' and retired_in_version_id is null;

CREATE UNIQUE INDEX uq_taxonomy_terms_preferred_label ON auction_search.taxonomy_terms (concept_dimension, language, normalized) WHERE term_type = 'preferred' and retired_in_version_id is null;

CREATE INDEX ix_taxonomy_terms_normalized_trgm ON auction_search.taxonomy_terms USING gin (normalized public.gin_trgm_ops);

CREATE TABLE auction_search.taxonomy_relationships (
    id BIGINT GENERATED ALWAYS AS IDENTITY, 
    relationship_type TEXT NOT NULL, 
    source_concept_id BIGINT NOT NULL, 
    source_dimension TEXT NOT NULL, 
    target_concept_id BIGINT NOT NULL, 
    target_dimension TEXT NOT NULL, 
    notes TEXT, 
    review_status TEXT DEFAULT 'candidate' NOT NULL, 
    confidence NUMERIC(4, 3) DEFAULT 1 NOT NULL, 
    provenance TEXT NOT NULL, 
    introduced_in_version_id INTEGER NOT NULL, 
    retired_in_version_id INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_taxonomy_relationships PRIMARY KEY (id), 
    CONSTRAINT fk_taxonomy_relationships_source_concept_id_source_dime_50a0 FOREIGN KEY(source_concept_id, source_dimension) REFERENCES auction_search.taxonomy_concepts (id, dimension) ON UPDATE CASCADE, 
    CONSTRAINT fk_taxonomy_relationships_target_concept_id_target_dime_0e49 FOREIGN KEY(target_concept_id, target_dimension) REFERENCES auction_search.taxonomy_concepts (id, dimension) ON UPDATE CASCADE, 
    CONSTRAINT fk_taxonomy_relationships_relationship_type_source_dime_eea6 FOREIGN KEY(relationship_type, source_dimension, target_dimension) REFERENCES auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension), 
    CONSTRAINT ck_taxonomy_relationships_not_self CHECK (source_concept_id <> target_concept_id), 
    CONSTRAINT ck_taxonomy_relationships_related_canonical_order CHECK (relationship_type <> 'related' or source_concept_id < target_concept_id), 
    CONSTRAINT ck_taxonomy_relationships_confidence_range CHECK (confidence >= 0 and confidence <= 1), 
    CONSTRAINT ck_taxonomy_relationships_review_status CHECK (review_status in ('candidate', 'approved', 'rejected')), 
    CONSTRAINT ck_taxonomy_relationships_provenance CHECK (provenance in ('seed', 'source_category', 'rule_extraction', 'ai_extraction', 'manual', 'search_feedback')), 
    CONSTRAINT ck_taxonomy_relationships_retired_after CHECK (retired_in_version_id is null or retired_in_version_id > introduced_in_version_id), 
    CONSTRAINT uq_taxonomy_relationships_relationship_type_source_conc_a967 UNIQUE (relationship_type, source_concept_id, target_concept_id), 
    CONSTRAINT fk_taxonomy_relationships_introduced_in_version_id_taxo_e79c FOREIGN KEY(introduced_in_version_id) REFERENCES auction_search.taxonomy_versions (id), 
    CONSTRAINT fk_taxonomy_relationships_retired_in_version_id_taxonom_ccc5 FOREIGN KEY(retired_in_version_id) REFERENCES auction_search.taxonomy_versions (id)
);

CREATE INDEX ix_taxonomy_relationships_source ON auction_search.taxonomy_relationships (source_concept_id, relationship_type);

CREATE INDEX ix_taxonomy_relationships_target ON auction_search.taxonomy_relationships (target_concept_id, relationship_type);

CREATE TABLE auction_search.taxonomy_evidence (
    id BIGINT GENERATED ALWAYS AS IDENTITY, 
    concept_id BIGINT, 
    term_id BIGINT, 
    relationship_id BIGINT, 
    lot_id BIGINT, 
    source TEXT, 
    source_lot_id TEXT, 
    source_field TEXT, 
    quote TEXT, 
    extractor TEXT NOT NULL, 
    extractor_version TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_taxonomy_evidence PRIMARY KEY (id), 
    CONSTRAINT ck_taxonomy_evidence_exactly_one_target CHECK (num_nonnulls(concept_id, term_id, relationship_id) = 1), 
    CONSTRAINT fk_taxonomy_evidence_concept_id_taxonomy_concepts FOREIGN KEY(concept_id) REFERENCES auction_search.taxonomy_concepts (id), 
    CONSTRAINT fk_taxonomy_evidence_term_id_taxonomy_terms FOREIGN KEY(term_id) REFERENCES auction_search.taxonomy_terms (id), 
    CONSTRAINT fk_taxonomy_evidence_relationship_id_taxonomy_relationships FOREIGN KEY(relationship_id) REFERENCES auction_search.taxonomy_relationships (id)
);

CREATE INDEX ix_taxonomy_evidence_concept_id ON auction_search.taxonomy_evidence (concept_id);

CREATE INDEX ix_taxonomy_evidence_term_id ON auction_search.taxonomy_evidence (term_id);

CREATE INDEX ix_taxonomy_evidence_relationship_id ON auction_search.taxonomy_evidence (relationship_id);

CREATE INDEX ix_taxonomy_evidence_lot_id ON auction_search.taxonomy_evidence (lot_id);

CREATE TABLE auction_search.source_category_mappings (
    id BIGINT GENERATED ALWAYS AS IDENTITY, 
    source TEXT NOT NULL, 
    category_fr TEXT, 
    category_en TEXT, 
    concept_id BIGINT NOT NULL, 
    concept_dimension TEXT NOT NULL, 
    assertion TEXT DEFAULT 'classified_as' NOT NULL, 
    notes TEXT, 
    review_status TEXT DEFAULT 'candidate' NOT NULL, 
    confidence NUMERIC(4, 3) DEFAULT 1 NOT NULL, 
    provenance TEXT NOT NULL, 
    introduced_in_version_id INTEGER NOT NULL, 
    retired_in_version_id INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_source_category_mappings PRIMARY KEY (id), 
    CONSTRAINT fk_source_category_mappings_concept_id_concept_dimensio_eb28 FOREIGN KEY(concept_id, concept_dimension) REFERENCES auction_search.taxonomy_concepts (id, dimension) ON UPDATE CASCADE, 
    CONSTRAINT fk_source_category_mappings_assertion_concept_dimension_01d1 FOREIGN KEY(assertion, concept_dimension) REFERENCES auction_search.lot_assertion_rules (assertion, dimension), 
    CONSTRAINT ck_source_category_mappings_has_category CHECK (num_nonnulls(category_fr, category_en) >= 1), 
    CONSTRAINT ck_source_category_mappings_confidence_range CHECK (confidence >= 0 and confidence <= 1), 
    CONSTRAINT ck_source_category_mappings_review_status CHECK (review_status in ('candidate', 'approved', 'rejected')), 
    CONSTRAINT ck_source_category_mappings_provenance CHECK (provenance in ('seed', 'source_category', 'rule_extraction', 'ai_extraction', 'manual', 'search_feedback')), 
    CONSTRAINT ck_source_category_mappings_retired_after CHECK (retired_in_version_id is null or retired_in_version_id > introduced_in_version_id), 
    CONSTRAINT uq_source_category_mappings_source_category_fr_category_22f4 UNIQUE NULLS NOT DISTINCT (source, category_fr, category_en, concept_id, assertion), 
    CONSTRAINT fk_source_category_mappings_introduced_in_version_id_ta_e3c8 FOREIGN KEY(introduced_in_version_id) REFERENCES auction_search.taxonomy_versions (id), 
    CONSTRAINT fk_source_category_mappings_retired_in_version_id_taxon_a874 FOREIGN KEY(retired_in_version_id) REFERENCES auction_search.taxonomy_versions (id)
);

CREATE INDEX ix_source_category_mappings_concept_id ON auction_search.source_category_mappings (concept_id);

CREATE TABLE auction_search.lot_concepts (
    id BIGINT GENERATED ALWAYS AS IDENTITY, 
    lot_id BIGINT NOT NULL, 
    source TEXT NOT NULL, 
    source_lot_id TEXT NOT NULL, 
    concept_id BIGINT NOT NULL, 
    concept_dimension TEXT NOT NULL, 
    assertion TEXT NOT NULL, 
    confidence NUMERIC(4, 3) NOT NULL, 
    method TEXT NOT NULL, 
    source_field TEXT, 
    evidence JSONB DEFAULT '{}'::jsonb NOT NULL, 
    content_hash TEXT, 
    taxonomy_version_id INTEGER NOT NULL, 
    review_status TEXT DEFAULT 'candidate' NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_lot_concepts PRIMARY KEY (id), 
    CONSTRAINT fk_lot_concepts_concept_id_concept_dimension_taxonomy_concepts FOREIGN KEY(concept_id, concept_dimension) REFERENCES auction_search.taxonomy_concepts (id, dimension) ON UPDATE CASCADE, 
    CONSTRAINT fk_lot_concepts_assertion_concept_dimension_lot_assertion_rules FOREIGN KEY(assertion, concept_dimension) REFERENCES auction_search.lot_assertion_rules (assertion, dimension), 
    CONSTRAINT ck_lot_concepts_method CHECK (method in ('rule', 'source_category', 'ai', 'manual')), 
    CONSTRAINT ck_lot_concepts_evidence_object CHECK (jsonb_typeof(evidence) = 'object'), 
    CONSTRAINT ck_lot_concepts_confidence_range CHECK (confidence >= 0 and confidence <= 1), 
    CONSTRAINT ck_lot_concepts_review_status CHECK (review_status in ('candidate', 'approved', 'rejected')), 
    CONSTRAINT uq_lot_concepts_lot_id_concept_id_assertion_taxonomy_version_id UNIQUE (lot_id, concept_id, assertion, taxonomy_version_id), 
    CONSTRAINT fk_lot_concepts_taxonomy_version_id_taxonomy_versions FOREIGN KEY(taxonomy_version_id) REFERENCES auction_search.taxonomy_versions (id)
);

CREATE INDEX ix_lot_concepts_source_lot ON auction_search.lot_concepts (source, source_lot_id);

CREATE INDEX ix_lot_concepts_concept ON auction_search.lot_concepts (concept_id, assertion);

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('category', 'Category', 'Catégorie', 'Top-level auction department, e.g. Furniture, Fine art, Fashion.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('subcategory', 'Subcategory', 'Sous-catégorie', 'Grouping inside a category, e.g. Footwear within Fashion, Seating within Furniture.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('object_type', 'Object type', 'Type d''objet', 'What the object is, e.g. ankle boots, commode, armchair.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('period', 'Historical period', 'Époque', 'When an object was made (dating). Carries start/end years.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('style', 'Style', 'Style', 'Stylistic idiom. An object can be in a style long after the period that created it.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('region', 'Country or region', 'Pays ou région', 'Place or culture of origin.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('material', 'Material', 'Matériau', 'What the object is made of.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('technique', 'Technique', 'Technique', 'How it was made or decorated, e.g. Boulle marquetry.');

INSERT INTO auction_search.taxonomy_dimensions (code, label_en, label_fr, description) VALUES ('maker', 'Maker, artist or brand', 'Auteur, artiste ou marque', 'Person, workshop, manufacture or brand; attributes.kind gives which.');

INSERT INTO auction_search.taxonomy_term_types (code, description) VALUES ('preferred', 'The preferred label in that language (at most one per concept and language).');

INSERT INTO auction_search.taxonomy_term_types (code, description) VALUES ('synonym', 'Another label with the same meaning in that language.');

INSERT INTO auction_search.taxonomy_term_types (code, description) VALUES ('spelling_variant', 'Alternative spelling or historical form, e.g. ''Buhl'' for ''Boulle''.');

INSERT INTO auction_search.taxonomy_term_types (code, description) VALUES ('abbreviation', 'Abbreviation or acronym.');

INSERT INTO auction_search.taxonomy_term_types (code, description) VALUES ('hidden', 'Matched but never displayed, e.g. a frequent misspelling.');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('broader', 'has broader concept', 'has narrower concept', true, false, true, 1.0, 'Is-a / part-of hierarchy inside compatible dimensions (ankle boots → boots → footwear).');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('related', 'is related to', 'is related to', false, true, false, 0.4, 'Generic association. Stored once, with source id < target id.');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('originated_in_period', 'originated in period', 'period saw the origin of style', false, false, false, 0.7, 'A style and the period that created it. NOT a synonym: later objects can share the style.');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('revival_of', 'is a revival of', 'was revived by', false, false, false, 0.5, 'A later style reviving an earlier one (Napoleon III revival of Louis XIV).');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('associated_technique', 'is associated with technique', 'is a technique associated with', false, false, false, 0.5, 'Technique characteristic of a style, period, object type or maker.');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('associated_material', 'is associated with material', 'is a material associated with', false, false, false, 0.4, 'Material characteristic of a style, technique, object type or maker.');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('named_after', 'is named after', 'gave its name to', false, false, false, 0.5, 'A technique, style or object type named after a maker (Boulle marquetry → A.-C. Boulle).');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('active_in_period', 'was active in period', 'period of activity of', false, false, false, 0.5, 'A maker''s period of activity.');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('associated_region', 'is associated with region', 'is a region associated with', false, false, false, 0.3, 'Place or culture associated with a style, period, maker, etc.');

INSERT INTO auction_search.taxonomy_relationship_types (code, label_en, inverse_label_en, is_hierarchical, is_symmetric, is_transitive, expansion_weight, description) VALUES ('characteristic_object', 'is characteristic of object type', 'is an object type typical of', false, false, false, 0.5, 'Object types typical of a style, technique or maker (Louis Vuitton → luggage).');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('active_in_period', 'maker', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'category', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'maker', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'object_type', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'period', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'region', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'style', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'subcategory', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_material', 'technique', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'category', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'maker', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'material', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'object_type', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'period', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'style', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'subcategory', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_region', 'technique', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'category', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'maker', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'material', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'object_type', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'period', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'region', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'style', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('associated_technique', 'subcategory', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'category', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'maker', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'material', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'object_type', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'object_type', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'object_type', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'period', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'region', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'style', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'subcategory', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'subcategory', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('broader', 'technique', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'maker', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'maker', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'maker', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'material', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'material', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'material', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'period', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'period', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'period', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'region', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'region', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'region', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'style', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'style', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'style', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'technique', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'technique', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('characteristic_object', 'technique', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('named_after', 'category', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('named_after', 'material', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('named_after', 'object_type', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('named_after', 'style', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('named_after', 'subcategory', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('named_after', 'technique', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('originated_in_period', 'style', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'category', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'maker', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'material', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'object_type', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'period', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'region', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'style', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'subcategory', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'category');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'maker');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'material');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'object_type');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'period');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'region');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'style');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'subcategory');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('related', 'technique', 'technique');

INSERT INTO auction_search.taxonomy_relationship_rules (relationship_type, source_dimension, target_dimension) VALUES ('revival_of', 'style', 'style');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('classified_as', 'category');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('classified_as', 'subcategory');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('classified_as', 'object_type');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('dated_to', 'period');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('in_style_of', 'style');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('made_by', 'maker');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('attributed_to', 'maker');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('workshop_of', 'maker');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('circle_of', 'maker');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('follower_of', 'maker');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('after', 'maker');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('made_of', 'material');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('uses_technique', 'technique');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('originates_from', 'region');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'category');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'subcategory');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'object_type');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'period');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'style');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'region');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'material');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'technique');

INSERT INTO auction_search.lot_assertion_rules (assertion, dimension) VALUES ('mentions', 'maker');

create view "auction_search".taxonomy_current_version as select id, label, published_at from "auction_search".taxonomy_versions where status = 'published';

create view "auction_search".published_concepts as select x.* from "auction_search".taxonomy_concepts x cross join "auction_search".taxonomy_current_version v where x.review_status = 'approved' and x.introduced_in_version_id <= v.id and (x.retired_in_version_id is null or x.retired_in_version_id > v.id);

create view "auction_search".published_terms as select x.* from "auction_search".taxonomy_terms x cross join "auction_search".taxonomy_current_version v where x.review_status = 'approved' and x.introduced_in_version_id <= v.id and (x.retired_in_version_id is null or x.retired_in_version_id > v.id);

create view "auction_search".published_relationships as select x.* from "auction_search".taxonomy_relationships x cross join "auction_search".taxonomy_current_version v where x.review_status = 'approved' and x.introduced_in_version_id <= v.id and (x.retired_in_version_id is null or x.retired_in_version_id > v.id);

INSERT INTO auction_search.alembic_version (version_num) VALUES ('0001') RETURNING auction_search.alembic_version.version_num;

COMMIT;

