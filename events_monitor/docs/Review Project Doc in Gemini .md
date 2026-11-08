I will generate a comprehensive review and improvement report for the **EventsMonitor** product specification and phased Codex prompts.  
I will now generate the detailed analysis report outlining strengths, critical gaps, risk areas, and concrete actionable suggestions for improvement.

EventsMonitor Review Report

Export

# 

Comprehensive Review & Improvement Report: EventsMonitor Specification

**Target Document:** EventsMonitor\_European\_Multisource\_Specification\_and\_Codex\_Prompts.md

**Review Type:** Architecture, Data Engineering, Search Design, and Prompt Engineering Assessment

**Status:** Complete

## **1\. Executive Summary**

The **EventsMonitor** specification is a exceptionally well-structured, production-oriented greenfield implementation plan. Its primary strengths lie in its **evidence-first approach (Phase 0\)**, **strict isolation guidelines** (preventing reliance on unverified reference schemas), and **rigorous classification model** (distinguishing *Confirmed*, *Possible*, and *Related* items to avoid hallucinated facts in fine art and domain discovery).

However, while the business logic and phased prompts are robust, several critical technical gaps exist in **vector model operations, multi-currency FX handling, n8n orchestration bottlenecks, and search benchmark evaluation methodology**. This report details these gaps and provides concrete, drop-in improvements to fortify the specification before execution.

## **2\. Key Strengths**

1. **Phase 0 CSV Pre-Analysis Gate:** Requiring data profiling before locking in PostgreSQL schema and n8n pipelines avoids costly schema refactoring later.  
2. **Honest Match Classification:** Forcing a tri-tier classification (*Confirmed*, *Possible*, *Related*) directly addresses the risks of semantic search (e.g., confusing "Louis XV style" with "Louis XV period").  
3. **Database & Environment Isolation:** Clear rules forbidding runtime dependencies or mutations on external reference databases protect existing assets.  
4. **European Expansion Design:** Enforcing source adapters with capability declarations (APIs vs. HTML scrapers, supported currencies, timezones) ensures scalable multi-country onboarding.

## **3\. Critical Gaps & Risk Areas**

### **3.1 Currency & Financial Handling**

* **Issue:** The spec states: *"Convert only for explicitly labelled display/filtering with a dated FX rate."* However, there is no specification for where FX rates are sourced, how multi-currency range filters (e.g., finding items under €3,000 when listed in GBP or CHF) are executed efficiently in SQL, or how rate fluctuations over time are indexed.  
* **Risk:** Slow database queries when converting currencies on-the-fly during full-text vector hybrid search.

### **3.2 Vector Embedding Governance & Re-indexing**

* **Issue:** Phase 6 requires events-monitor-embeddings to store vectors, but lacks a explicit strategy for **embedding model updates** or **dimensional mismatch handling** in pgvector when upgrading models (e.g., moving from 1536-dim to 3072-dim models).  
* **Risk:** Database index corruption or query runtime failures when vector dimensions shift across data versions.

### **3.3 n8n Orchestration Bottlenecks**

* **Issue:** Using n8n for high-throughput batch normalization and embedding generation can lead to severe memory consumption and workflow execution queue contention when processing tens of thousands of lots per auction catalog.  
* **Risk:** Slow ingestion rates, pipeline timeouts, and elevated operational overhead.

### **3.4 Citation & Source Evidence Contract**

* **Issue:** The spec requires source evidence explanations for matches, but does not define an internal JSON contract standard for binding an attribute (e.g., maker: "François Linke") back to the specific character offset or raw substring of the description text.  
* **Risk:** AI normalization outputs unverifiable claims that cannot be audited against raw catalog text.

## **4\. Concrete Improvement Recommendations**

Below are five major structural and technical enhancements to integrate into the final specification.

\+-----------------------------------------------------------------------------------+  
\|                            RECOMMENDED ENHANCEMENTS                               \|  
\+-----------------------------------------------------------------------------------+  
\| 1\. Dynamic Currency Normalization Architecture (Dual-column indexing \+ FX cache)  \|  
\| 2\. Standardized JSON Schema Contract for Source Evidence                          \|  
\| 3\. Explicit Vector Migration & Versioning Pattern for pgvector                    \|  
\| 4\. Heavy Ingestion Offloading (n8n for orchestration, worker process for data)    \|  
\| 5\. Enhanced Phase 0 Evaluation Metric (NDCG \+ Multi-class Precision/Recall)       \|  
\+-----------------------------------------------------------------------------------+

### **Recommendation 1: Dynamic Currency Normalization & Search Strategy**

Add a canonical currency conversion column set to lots:

* estimate\_low\_raw, estimate\_high\_raw, currency\_raw (Original catalog values)  
* estimate\_low\_eur, estimate\_high\_eur, fx\_rate\_date (Normalized values updated daily via ECB/FX API)  
* Create btree indexes on estimate\_high\_eur to enable zero-overhead cross-border numerical range queries.

### **Recommendation 2: Standardized Evidence Contract**

Enforce a unified JSON schema for Phase 0B & Phase 5 normalization outputs:

{  
  "attributes": {  
    "period": {  
      "value": "Louis XV",  
      "status": "explicit", // "explicit" \| "inferred" \| "unknown" \| "contradictory"  
      "evidence\_snippet": "époque Louis XV",  
      "source\_field": "description\_fr"  
    },  
    "maker": {  
      "value": "Jean-Henri Riesener",  
      "status": "inferred",  
      "evidence\_snippet": "attribué à Riesener",  
      "source\_field": "title\_fr"  
    }  
  }  
}

### **Recommendation 3: Explicit pgvector Model Versioning**

In docs/06-indexes.md, enforce multi-column embedding storage:

* Column naming pattern: embedding\_\<model\_name\>\_\<dimensions\> (e.g., embedding\_text\_embedding\_3\_small\_1536).  
* Allow blue/green index builds when migrating vector models without downtime.

## **5\. Revised Phased Codex Prompts (Updated Increments)**

To address the identified gaps, inject the following refined updates into **Phase 0B**, **Phase 3**, and **Phase 5**:

### **Updated Phase 0B Snippet (Inject Currency & Evidence Standard)**

"...Propose schema-validated normalization JSON for furniture, art, fashion, jewellery and decorative arts. **Define an explicit evidence contract linking every extracted attribute to its raw source substring, field name, and confidence status (explicit, inferred, unknown, contradictory). Define standard handling for non-EUR currencies and daily FX rate sync requirements.** Create docs/00-vocabulary-and-attributes.md..."

### **Updated Phase 3 Snippet (Inject Dual-Currency SQL Storage)**

"...Reproduce the approved compatible auctions and lots structures. **Include raw source currency/estimates alongside normalized EUR baseline columns (estimate\_low\_eur, estimate\_high\_eur) with indexes.** Deliver migrations, tests and docs/03-database.md. Stop after validation."

## **6\. Summary Checklist of Next Steps**

| Step | Action Item | Target Phase | Status |
| :---- | :---- | :---- | :---- |
| 1 | Provide real sample CSVs (Auctions \+ Lots) | Phase 0A | **Pending User Input** |
| 2 | Adopt Dual-Currency (\_eur) strategy in database proposal | Phase 1 & 3 | Ready to incorporate |
| 3 | Adopt JSON Evidence Contract in Normalization workflow | Phase 0B & 5 | Ready to incorporate |
| 4 | Add pgvector multi-model versioning migration rules | Phase 6 | Ready to incorporate |

Edit directly or with Gemini  
Click anywhere to type and edit directly, or select text to prompt Gemini for changes.  
I have generated the formal review report as a standalone markdown document (EventsMonitor\_Specification\_Review\_Report.md).

### **Highlights of the Review:**

> 1. **Identified Risk Areas:** Addressed currency conversion during range searches, vector model migration strategies in pgvector, and potential n8n execution bottlenecks for large catalogs.  
> 2. **Concrete Solutions:** Provided explicit schema designs for dual-currency indexing (estimate\_high\_eur), an exact JSON format for auditing source evidence snippets, and vector column versioning patterns.  
> 3. **Prompt Enhancements:** Included updated drop-in prompt additions for Phase 0B and Phase 3\.

Whenever you are ready to proceed with **Phase 0A**, please provide the sample auction and lot CSV datasets\!