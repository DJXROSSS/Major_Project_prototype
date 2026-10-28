# CSE Student Placement Intelligence System — Architecture & Technical Reference

**Document Version:** 1.0  
**Target Stack:** React.js (Vite + Tailwind CSS) | Java Spring Boot (REST API) | MySQL 8.0  
**Team Size:** 5 Developers  

---

## 1. Executive Summary & Core Problem Statement

The **CSE Student Placement Intelligence System** is an intelligent placement readiness and decision platform designed for Technical Trainers, Students, and Administrators (TPOs). Unlike static college portals that only record CGPA, this system ingests ongoing **daily/weekly exam sheets** and **mock interview evaluations**, maintains an immutable audit log of every upload, dynamically computes a **Student 360° Profile**, and matches students against company-specific skill requirements (e.g., Infosys requiring strong DSA, or Cognizant requiring Java and Spring Boot).

### The Core Technical Roadblock & How This Architecture Solves It
1. **Unstructured / Arbitrary Excel Uploads:** Trainers upload Excel sheets for exams and mock interviews that do not follow a fixed template and may contain unexpected columns.
2. **Dynamic Admin Parameters:** Administrators need the ability to "add columns" or new evaluation parameters (such as a new framework or behavioral metric) without breaking the database or requiring backend code rewrites.
3. **Fast Relational Filtering vs. Flexible Storage:** The system must preserve the exact original Excel data per exam while still allowing millisecond SQL filtering across normalized skills (e.g., *"Find all students with $\text{DSA} \ge 80\%$ and $\text{Spring Boot} \ge 75\%$"*).

**The Architectural Solution:** A **Hybrid Relational + JSON Data Model** paired with a **Frontend Header-Mapping Pipeline** inside a **Modular Monolith**.

---

## 2. System Architecture: Reconciling the Diagrams

In your project artifacts, you have two complementary views of the system:
1. **Logical Service Flow Diagram:** Shows an API Gateway routing to specialized services (`Authentication`, `Student Service`, `Excel/CSV Import Service`, `Exam Service`, `Interview Service`, `Company & Requirements Service`, `Student Matching Service`) and separate data stores.
2. **PRD 3-Tier Technical Architecture:** Specifies a React.js + Tailwind frontend, a single Java Spring Boot backend, and a unified MySQL 8.0 database.

### Architectural Decision: The Modular Monolith
**Do not deploy 7 separate physical databases.** Joining student profiles, exam scores, interview feedback, and company cutoffs across 7 separate databases requires distributed transactions and data-sync pipelines that will stall a 5-person team.

Instead, keep the **Logical Service Diagram** for mentor presentations, and implement it physically as a **Modular Monolith**:
* **One Spring Boot Application** divided into clean domain packages (`auth`, `student`, `ingestion`, `evaluation`, `matching`, `analytics`).
* **One MySQL 8.0 Database** where all tables live together, enabling fast SQL `JOIN`s and aggregations for the Student 360° Dashboard.

```
+-----------------------------------------------------------------------------------+
|                        1. CLIENT PRESENTATION LAYER (React + Tailwind)            |
|  +-----------------------+  +------------------------+  +----------------------+  |
|  |    Trainer Portal     |  |  Student 360° Portal   |  |     Admin Portal     |  |
|  | - Batch PR/NPR Charts |  | - Domain Scorecards    |  | - Skill Taxonomy Mgr |  |
|  | - Excel Column Mapper |  | - Subject Bar Graphs   |  | - Custom Field Mgr   |  |
|  | - Company Filter UI   |  | - Strong/Weak Feedback |  | - Company Cutoffs    |  |
|  | - 360° Drill-down     |  | - Historical Timeline  |  | - Drive Management   |  |
|  +-----------+-----------+  +------------+-----------+  +----------+-----------+  |
+--------------|---------------------------|-------------------------|--------------+
               |                           |                         |
               +---------------------------+-------------------------+
                                           | REST API (JSON / JWT)
                                           v
+-----------------------------------------------------------------------------------+
|                   2. APPLICATION SERVICE LAYER (Java Spring Boot)                 |
|                                                                                   |
|  +--------------------+  +-----------------------+  +--------------------------+  |
|  | M-01: Auth & RBAC  |  | M-02: Skill Taxonomy  |  | M-03 & M-04: Ingestion & |  |
|  | Service            |  | & Core CS Engine      |  | Evaluation Engine        |  |
|  +--------------------+  +-----------------------+  +--------------------------+  |
|  +--------------------+  +-----------------------+  +--------------------------+  |
|  | M-05: Student 360° |  | M-06: Company Match   |  | M-07 & M-08: Drives &    |  |
|  | Aggregator Service |  | & Filter Engine       |  | Analytics Engine         |  |
|  +--------------------+  +-----------------------+  +--------------------------+  |
+------------------------------------------|----------------------------------------+
                                           | Spring Data JPA / Native SQL + JSON
                                           v
+-----------------------------------------------------------------------------------+
|                     3. DATA PERSISTENCE LAYER (Single MySQL 8.0 DB)               |
|                                                                                   |
|  [users & students]  [skill_taxonomy]  [import_batches]  [evaluation_records]     |
|  [skill_ratings]     [company_roles]   [placement_drives & drive_applications]    |
+-----------------------------------------------------------------------------------+
```

---

## 3. Solving the "Arbitrary Excel Sheet" & "Dynamic Columns" Problem

### 3.1 Rule 1: Never Run `ALTER TABLE` from the Admin Portal
When the Admin wants to "add a new column" (e.g., adding *Spring Boot*, *System Design*, or *Aptitude*), they are adding a **row** to the `skill_taxonomy` table—never executing `ALTER TABLE ADD COLUMN` on the student table.
* **Why:** Relational rows in `skill_taxonomy` and `skill_ratings` can scale to hundreds of skills dynamically while keeping JPA entities static and indexed.
* **Non-Skill Custom Fields:** If an Admin wants to add a non-skill attribute to a student profile (e.g., `"Hostel_Resident"`, `"GitHub_URL"`, `"Backlog_Count"`), it is stored inside the `custom_profile_fields` `JSON` column on the `students` table.

### 3.2 Rule 2: The 3-Step Interactive Excel Column Mapper
Because the mentor stated that *"there could be anything in that Excel sheet,"* you cannot hardcode column headers like `Roll_No` or `DSA_Score` in your backend parser. Instead, implement a **Header Mapping Step** in the React frontend using `SheetJS (xlsx)`:

1. **Step 1 — File Drop & Header Extraction (Frontend):**
   The Trainer selects an Excel/CSV file and chooses the Event Type (`EXAM` or `MOCK_INTERVIEW`) and Event Title (e.g., *"Weekly Readiness Test #4"*). The frontend reads the first row of the sheet and extracts all column headers.
2. **Step 2 — 30-Second Column Classification UI (Frontend):**
   The Trainer sees a simple table listing every column found in the Excel sheet and maps each column to one of four buckets:
   * **Identity Column (Mandatory):** Maps to `roll_no` or `email` (e.g., Excel column `"University ID"` -> `roll_no`).
   * **Skill Score Columns:** Maps a numeric column to any active skill in `skill_taxonomy` and specifies the **Max Marks** (e.g., Excel column `"Trees & Graphs (Out of 50)"` -> Skill: `DSA`, Max Marks: $50$).
   * **Qualitative Review Columns:** Maps text columns to `strengths`, `weaknesses`, `unanswered_questions`, or `behavior_remarks`.
   * **Unmapped / Arbitrary Columns (Auto-Handled):** Any column the Trainer leaves unmapped (e.g., `"Interviewer_Name"`, `"Late_Submission_Penalty"`, `"Camera_Status"`) is automatically tagged as `CUSTOM_ATTRIBUTE`.
3. **Step 3 — Dual Storage on the Backend:**
   When submitted, the backend saves:
   * **The Raw Row:** The exact, unaltered JSON representation of the Excel row into `evaluation_records.raw_excel_row` (so the original exam sheet can always be viewed or audited exactly as uploaded).
   * **The Custom Attributes:** All unmapped columns into `evaluation_records.custom_attributes` (`JSON`).
   * **The Normalized Skill Ratings:** Each mapped skill score is normalized to a $0\text{--}100\%$ scale and inserted into `skill_ratings` linked to the `evaluation_records.record_id`.

---

## 4. Complete Hybrid Database Schema (MySQL 8.0)

Run this SQL script to initialize your entire database. It supports all V1–V3 PRD requirements, arbitrary Excel storage, historical auditing, and company matching.

```sql
CREATE DATABASE IF NOT EXISTS placement_intelligence_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE placement_intelligence_db;

-- ============================================================================
-- 1. USERS & AUTHENTICATION (Module M-01)
-- ============================================================================
CREATE TABLE users (
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role ENUM('ADMIN', 'TRAINER', 'STUDENT') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. STUDENT PROFILES & 360 SUMMARY CACHE (Module M-01 & M-05)
-- ============================================================================
CREATE TABLE students (
    student_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNIQUE,
    roll_no VARCHAR(50) NOT NULL UNIQUE,
    batch_year INT NOT NULL,
    branch VARCHAR(80) DEFAULT 'CSE',
    section VARCHAR(20),
    cgpa DECIMAL(4,2) DEFAULT 0.00,
    
    -- Cached 360° Metrics (Recalculated automatically after every upload)
    readiness_status ENUM('PR', 'NPR', 'NDSA', 'NCORE') DEFAULT 'NPR',
    overall_readiness_score DECIMAL(5,2) DEFAULT 0.00,
    core_cs_index_score DECIMAL(5,2) DEFAULT 0.00,
    
    -- Dynamic JSON fields for Persona Badges & Admin-added custom columns
    persona_badges JSON DEFAULT (JSON_ARRAY()),        -- e.g. ["DSA Strong", "Core CS Strong"]
    custom_profile_fields JSON DEFAULT (JSON_OBJECT()),-- Admin-defined extra student columns
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_student_roll (roll_no),
    INDEX idx_student_batch_readiness (batch_year, readiness_status)
);

-- ============================================================================
-- 3. DYNAMIC SKILL TAXONOMY (Module M-02)
-- Admin adds new skills/parameters here as ROWS rather than altering tables.
-- ============================================================================
CREATE TABLE skill_taxonomy (
    skill_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    skill_code VARCHAR(50) NOT NULL UNIQUE,            -- e.g. 'DSA', 'DBMS', 'SPRING_BOOT'
    skill_name VARCHAR(100) NOT NULL,                  -- e.g. 'Data Structures & Algorithms'
    domain_category ENUM(
        'PROGRAMMING_DSA',
        'CORE_CS',
        'SOFTWARE_DEV',
        'EMPLOYABILITY_SOFT_SKILLS'
    ) NOT NULL,
    is_core_cs_metric BOOLEAN DEFAULT FALSE,           -- Flag for Dedicated Core CS Index
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. EXCEL IMPORT BATCH LOG (Module M-03 & M-04 Audit Trail)
-- Keeps metadata and column-mapping configuration of every uploaded sheet.
-- ============================================================================
CREATE TABLE import_batches (
    batch_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uploaded_by BIGINT NOT NULL,
    event_type ENUM('EXAM', 'MOCK_INTERVIEW', 'PROJECT_REVIEW') NOT NULL,
    event_title VARCHAR(200) NOT NULL,                 -- e.g. 'Weekend Readiness Test 3'
    event_date DATE NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    total_rows_processed INT DEFAULT 0,
    column_mapping_config JSON NOT NULL,               -- Stores how headers were mapped
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_import_user FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);

-- ============================================================================
-- 5. EVALUATION RECORDS (Individual Exam / Mock Interview Logs per Student)
-- Preserves qualitative feedback AND the raw unstructured Excel data.
-- ============================================================================
CREATE TABLE evaluation_records (
    record_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT,                                   -- NULL if entered manually via form
    student_id BIGINT NOT NULL,
    evaluator_id BIGINT,
    event_type ENUM('EXAM', 'MOCK_INTERVIEW', 'PROJECT_REVIEW') NOT NULL,
    event_title VARCHAR(200) NOT NULL,
    evaluated_at DATE NOT NULL,
    
    overall_event_score_pct DECIMAL(5,2),
    
    -- Structured Qualitative Feedback (for Mock Interviews & Trainer Reviews)
    strengths TEXT,
    weaknesses TEXT,
    unanswered_questions TEXT,
    behavior_remarks TEXT,
    recommended_action ENUM(
        'DIRECT_REFERRAL_REVIEW',
        'COMPANY_READY',
        'TARGETED_TRAINING',
        'RESCHEDULE_INTERVIEW'
    ) DEFAULT 'TARGETED_TRAINING',
    
    -- Unstructured / Arbitrary Excel Preservation
    raw_excel_row JSON NOT NULL,                       -- Exact key-value copy of the Excel row
    custom_attributes JSON DEFAULT (JSON_OBJECT()),    -- Extra unmapped columns from Excel
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_eval_batch FOREIGN KEY (batch_id) REFERENCES import_batches(batch_id) ON DELETE CASCADE,
    CONSTRAINT fk_eval_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    INDEX idx_eval_student_date (student_id, evaluated_at)
);

-- ============================================================================
-- 6. NORMALIZED SKILL RATINGS (Module M-03, M-05, M-06)
-- Powers fast multi-criteria filtering, 360° radar/bar charts & timelines.
-- ============================================================================
CREATE TABLE skill_ratings (
    rating_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    skill_id BIGINT NOT NULL,
    record_id BIGINT NOT NULL,                         -- Traceability back to evaluation_records
    source_type ENUM('EXAM', 'MOCK_INTERVIEW', 'PROJECT_REVIEW') NOT NULL,
    raw_score DECIMAL(8,2) NOT NULL,
    max_score DECIMAL(8,2) NOT NULL,
    score_percentage DECIMAL(5,2) NOT NULL,            -- Normalized 0.00 to 100.00
    recorded_at DATE NOT NULL,
    
    CONSTRAINT fk_rating_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    CONSTRAINT fk_rating_skill FOREIGN KEY (skill_id) REFERENCES skill_taxonomy(skill_id) ON DELETE CASCADE,
    CONSTRAINT fk_rating_record FOREIGN KEY (record_id) REFERENCES evaluation_records(record_id) ON DELETE CASCADE,
    INDEX idx_rating_student_skill (student_id, skill_id),
    INDEX idx_rating_skill_score (skill_id, score_percentage)
);

-- ============================================================================
-- 7. COMPANY REQUIREMENTS & ROLES (Module M-06 & M-07)
-- ============================================================================
CREATE TABLE company_roles (
    role_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(150) NOT NULL,                -- e.g. 'Infosys', 'Cognizant'
    role_title VARCHAR(150) NOT NULL,                  -- e.g. 'Specialist Programmer', 'GenC Next'
    package_ctc_lpa DECIMAL(5,2),
    min_cgpa DECIMAL(4,2) DEFAULT 6.00,
    
    -- JSON array of required skills, minimum cutoffs, and weightages
    -- Example: [{"skillCode":"DSA","minPct":75,"weight":0.50}, {"skillCode":"JAVA","minPct":70,"weight":0.50}]
    skill_requirements JSON NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pre-seed core skills in skill_taxonomy
INSERT INTO skill_taxonomy (skill_code, skill_name, domain_category, is_core_cs_metric) VALUES
('DSA', 'Data Structures & Algorithms', 'PROGRAMMING_DSA', FALSE),
('OOPS', 'Object-Oriented Programming', 'PROGRAMMING_DSA', FALSE),
('JAVA', 'Java Programming', 'PROGRAMMING_DSA', FALSE),
('DBMS', 'Database Management Systems & SQL', 'CORE_CS', TRUE),
('OS', 'Operating Systems', 'CORE_CS', TRUE),
('CN', 'Computer Networks', 'CORE_CS', TRUE),
('CLOUD_ARCH', 'Cloud Computing & Computer Architecture', 'CORE_CS', TRUE),
('SPRING_BOOT', 'Spring Boot & Microservices', 'SOFTWARE_DEV', FALSE),
('REACT_WEB', 'Frontend / Web Development', 'SOFTWARE_DEV', FALSE),
('COMMUNICATION', 'Communication & Soft Skills', 'EMPLOYABILITY_SOFT_SKILLS', FALSE),
('APTITUDE', 'Quantitative & Logical Aptitude', 'EMPLOYABILITY_SOFT_SKILLS', FALSE);
```

---

## 5. Mathematical Formulas & Scoring Engine Rules

All scoring calculations reside inside the `SkillAggregationService` and `CompanyMatchingService` in your Spring Boot backend.

### 5.1 Score Normalization on Ingestion
Whenever an Excel sheet or mock interview is uploaded, any raw score $S_{\text{raw}}$ with maximum marks $S_{\text{max}}$ (where $S_{\text{max}} > 0$) is converted to a normalized percentage $S_{\text{norm}}$:

$$S_{\text{norm}} = \left( \frac{S_{\text{raw}}}{S_{\text{max}}} \right) \times 100$$

If a mock interviewer rates a student on a $1\text{--}5$ rubric scale, $S_{\text{max}} = 5$, so a rating of $4$ becomes $80\%$.

### 5.2 Dynamic Multi-Source Skill Score ($\bar{S}_{k}$)
For any student and a given skill $k$, let $S_{k,1}, S_{k,2}, \dots, S_{k,N}$ be the historical normalized scores across $N$ evaluations. To reward recent improvement while maintaining historical integrity, use either a simple average or recency-weighted average:

$$\bar{S}_{k} = \frac{1}{N} \sum_{i=1}^{N} S_{k,i}$$

### 5.3 Dedicated Core CS Readiness Index ($I_{\text{CoreCS}}$)
Let $C$ be the set of skills in `skill_taxonomy` where `is_core_cs_metric = TRUE` ($\text{DBMS}, \text{OS}, \text{CN}, \text{Cloud/Arch}$). The student's Core CS Index is:

$$I_{\text{CoreCS}} = \frac{1}{|C|} \sum_{c \in C} \bar{S}_{c}$$

### 5.4 Batch Pie-Chart Readiness Classification (`PR`, `NPR`, `NDSA`, `NCORE`)
Your Trainer Dashboard wireframe features a batch breakdown pie chart with four slices: **`PR`** (Placement Ready), **`NPR`** (Not Placement Ready), **`NDSA`** (Needs DSA Training), and **`NCORE`** (Needs Core CS Training). Compute this automatically for each student using threshold rules:
* **`PR` (Placement Ready):** $\bar{S}_{\text{DSA}} \ge 70\%$ AND $I_{\text{CoreCS}} \ge 70\%$ AND $\bar{S}_{\text{COMMUNICATION}} \ge 65\%$
* **`NDSA` (Needs DSA):** $\bar{S}_{\text{DSA}} < 60\%$ AND $I_{\text{CoreCS}} \ge 65\%$
* **`NCORE` (Needs Core CS):** $I_{\text{CoreCS}} < 60\%$ AND $\bar{S}_{\text{DSA}} \ge 65\%$
* **`NPR` (Not Placement Ready):** Both $\bar{S}_{\text{DSA}} < 60\%$ AND $I_{\text{CoreCS}} < 60\%$ (or overall readiness $< 55\%$)

### 5.5 Automated Talent Persona Badges
Assign badges into `students.persona_badges` (`JSON`) after recalculating averages:
* `🟢 DSA Strong`: $\bar{S}_{\text{DSA}} \ge 80\%$
* `🟢 Core CS Strong`: $I_{\text{CoreCS}} \ge 80\%$
* `🟢 Development Strong`: Average of `SOFTWARE_DEV` domain skills $\ge 80\%$
* `🟢 Communication Strong`: $\bar{S}_{\text{COMMUNICATION}} \ge 80\%$
* `🟢 All-Rounder`: All four primary domains $\ge 75\%$
* `🟡 Needs Targeted Training`: Any primary domain $< 50\%$

### 5.6 Company Weighted Match Percentage ($M_{\text{role}}$)
For a company job role defining a set of required skills $R$, where each skill $k \in R$ has weight $w_k$ (such that $\sum_{k \in R} w_k = 1.0$) and minimum cutoff $c_k$:

$$M_{\text{role}} = \sum_{k \in R} \left( w_k \cdot \bar{S}_{k} \right)$$

A student is flagged as **Eligible & Shortlisted** if $\text{CGPA} \ge \text{CGPA}_{\min}$ and $\bar{S}_{k} \ge c_k$ for all mandatory skills $k \in R$.

---

## 6. Concrete API & SQL Query Contracts

### 6.1 JSON Contract: Uploading & Mapping an Arbitrary Excel Sheet
After the Trainer maps the headers in the React UI (`SheetJS`), the frontend sends this single payload to `POST /api/v1/imports/upload`:

```json
{
  "eventType": "MOCK_INTERVIEW",
  "eventTitle": "Pre-Placement Mock Interview - Cognizant Batch",
  "eventDate": "2026-10-28",
  "originalFilename": "cognizant_mock_oct28.xlsx",
  "columnMapping": {
    "studentIdentifierColumn": "University_Roll",
    "skillMappings": [
      { "excelColumn": "DSA_Problem_Solving", "skillCode": "DSA", "maxScore": 10 },
      { "excelColumn": "Java_Core", "skillCode": "JAVA", "maxScore": 10 },
      { "excelColumn": "Spring_Boot_Qns", "skillCode": "SPRING_BOOT", "maxScore": 10 },
      { "excelColumn": "DBMS_Queries", "skillCode": "DBMS", "maxScore": 10 },
      { "excelColumn": "HR_Comm_Score", "skillCode": "COMMUNICATION", "maxScore": 5 }
    ],
    "qualitativeMappings": {
      "strengthsColumn": "Candidate_Strengths",
      "weaknessesColumn": "Weak_Areas",
      "behaviorRemarksColumn": "Body_Language_And_Attitude",
      "recommendedActionColumn": "Final_Verdict"
    },
    "customAttributeColumns": [
      "Panelist_Name",
      "Resume_Link",
      "Camera_Background_Check"
    ]
  },
  "rows": [
    {
      "University_Roll": "23CSE101",
      "Student_Name": "Advay Sharma",
      "DSA_Problem_Solving": 8.5,
      "Java_Core": 9.0,
      "Spring_Boot_Qns": 8.0,
      "DBMS_Queries": 5.5,
      "HR_Comm_Score": 4.0,
      "Candidate_Strengths": "Strong OOPs concepts and clean REST controller logic",
      "Weak_Areas": "Struggled with B-Tree indexing and SQL self-joins",
      "Body_Language_And_Attitude": "Confident and articulate",
      "Final_Verdict": "COMPANY_READY",
      "Panelist_Name": "R. Verma",
      "Resume_Link": "https://drive.example.com/advay",
      "Camera_Background_Check": "Pass"
    }
  ]
}
```

### 6.2 SQL Query: Multi-Criteria Company Filtering (e.g., Cognizant / Infosys)
When the Trainer filters students for **Cognizant** ($\text{Java} \ge 75\%$ AND $\text{Spring Boot} \ge 70\%$) or **Infosys** ($\text{DSA} \ge 80\%$):

```sql
SELECT 
    s.student_id,
    s.roll_no,
    u.full_name,
    s.cgpa,
    s.readiness_status,
    ROUND(AVG(CASE WHEN st.skill_code = 'DSA' THEN sr.score_percentage END), 1) AS dsa_avg,
    ROUND(AVG(CASE WHEN st.skill_code = 'JAVA' THEN sr.score_percentage END), 1) AS java_avg,
    ROUND(AVG(CASE WHEN st.skill_code = 'SPRING_BOOT' THEN sr.score_percentage END), 1) AS spring_boot_avg,
    ROUND(AVG(CASE WHEN st.skill_code = 'DBMS' THEN sr.score_percentage END), 1) AS dbms_avg,
    ROUND(AVG(CASE WHEN st.skill_code = 'COMMUNICATION' THEN sr.score_percentage END), 1) AS comm_avg
FROM students s
JOIN users u ON s.user_id = u.user_id
LEFT JOIN skill_ratings sr ON s.student_id = sr.student_id
LEFT JOIN skill_taxonomy st ON sr.skill_id = st.skill_id
WHERE s.cgpa >= 6.5
GROUP BY s.student_id, s.roll_no, u.full_name, s.cgpa, s.readiness_status
HAVING java_avg >= 75.0 AND spring_boot_avg >= 70.0
ORDER BY (java_avg * 0.5 + spring_boot_avg * 0.5) DESC;
```

---

## 7. UI Wireframe Mapping (Portals & Views)

Based on your hand-drawn wireframes (`1000125942.jpg`), build **one unified `<Student360Card />` component** in React and reuse it across both the Trainer Portal and Student Portal.

### 7.1 Trainer Portal (`TrainerDashboard.jsx`)
* **Top Navigation Bar:** `Dashboard` | `Excel Data Upload` | `360° Student Filter` | `Sign-On/Out`
* **Top Section (Batch Overview):**
  * **Left Panel:** Scrollable list of Students (`Top 10 Students` / `Focus Students` toggle) with a `View More` button. Clicking a student loads their profile into the bottom 360° section.
  * **Right Panel:** Batch Readiness Pie Chart (`PR`, `NPR`, `NDSA`, `NCORE`) + KPI counters (`Placement Ready = ?`, `Rescheduled Interview = ?`, `Mock Interview Count = ?`, `DSA Avg = ?`).
* **Bottom Section (Selected Student 360° Drill-Down — e.g., "Advay Sharma"):**
  * **Left:** Vertical Bar Chart (`Progress Graph` $0\text{--}100$) plotting subject averages: `DSA`, `OS`, `CN`, `DBMS`, `OOPS`, `Comm`.
  * **Center:** `Strong Field` list (auto-populated with skills $\ge 75\%$, e.g., `DSA`, `CORE`, `Communication`) + `Overall Performance Status` badge (`PR` / `NPR`).
  * **Right:** `Weak Field` list (auto-populated with skills $< 60\%$, e.g., `DBMS`) + latest interviewer actionable notes (`How to improve`).

### 7.2 Student Portal (`StudentDashboard.jsx`)
* **Top Navigation Bar:** `Dashboard` | `Performance` | `Drives Info` | `Log in/out`
* **Top Row (3 Cards):**
  1. `Personal Details`: Name, Email, Roll No, Section, CGPA, Persona Badges.
  2. `Recent Exams Information (Graph)`: Line or bar chart showing scores across the last 5 uploaded exams/interviews.
  3. `Overall Performance Graph`: Domain radar or bar chart across the 4 primary domains.
* **Bottom Row (2 Cards):**
  1. `Weak Areas / Areas to Target`: Pulls low-scoring skills ($< 60\%$) and displays the `weaknesses` and `unanswered_questions` logged by trainers.
  2. `Strong Areas / How to Improve Further`: Pulls top skills ($\ge 75\%$) and displays `strengths` and company role matches where the student has a high compatibility score.

### 7.3 Admin Portal (`AdminDashboard.jsx`)
* **Top Navigation Bar:** `Student DB` | `Trainer DB` | `Skill & Column Config` | `Placement Drives` | `Log in/out`
* **Key Views:**
  * **Skill & Dynamic Parameter Manager:** Add new skills to `skill_taxonomy` (e.g., adding *Spring Boot* or *React*) or add custom profile fields.
  * **Company & Role Configurator:** Create company profiles (Infosys, Cognizant, TCS, etc.) and set skill weightages and cutoffs.
  * **Database Grid Editor:** View/edit student master records and inspect raw Excel import batches.

---

## 8. 5-Member Team Division & Sprint Execution Plan

To prevent bottlenecks, assign each team member a distinct vertical slice of the stack:

| Team Member | Role & Ownership | Key Deliverables |
| :--- | :--- | :--- |
| **Member 1** | **Backend Lead: DB, Auth & Admin Taxonomy (M-01, M-02)** | MySQL schema setup, Spring Security + JWT RBAC (`ADMIN`, `TRAINER`, `STUDENT`), User/Student CRUD APIs, and Admin `skill_taxonomy` + custom field APIs. |
| **Member 2** | **Backend Lead: Excel Ingestion & Audit Engine (M-03, M-04)** | `POST /api/v1/imports/upload` endpoint, saving `import_batches`, `evaluation_records` (with `raw_excel_row` and `custom_attributes` JSON), and normalizing scores into `skill_ratings`. |
| **Member 3** | **Backend Lead: 360° Aggregator & Company Matching (M-05, M-06, M-08)** | SQL aggregation queries for Student 360° scores, Core CS Index calculator, PR/NPR/Persona tagging engine, and Multi-Criteria Company Filter / Weighted Match APIs. |
| **Member 4** | **Frontend Lead: Trainer & Admin Portals** | React Trainer Dashboard (Batch Pie Chart, Top/Focus student list), `SheetJS` Interactive Excel Column Mapper modal, Multi-criteria Company Filter table, and Admin Taxonomy UI. |
| **Member 5** | **Frontend Lead: Student 360° Portal & Charts** | Reusable `<Student360View />` component, Subject Bar Graph (`DSA`, `OS`, `CN`, `DBMS`, `OOPS`, `Comm`), Historical Growth Line Chart (`Recharts` or `Chart.js`), and Strong/Weak Feedback cards. |

### How to Manage Your Mentor (Scope-Creep Shield)
1. **Demo the Excel Mapper First:** As soon as Member 2 and Member 4 wire up the `SheetJS` Column Mapper with the `raw_excel_row` and `custom_attributes` JSON columns, show it to your mentor. When they see that *any* arbitrary Excel column is automatically captured, stored, and displayed without breaking the database, their biggest objection will be resolved.
2. **Enforce Sprint Boundaries:** Follow the PRD versions strictly:
   * **Milestone 1 (Sprints 1–2):** Auth, Dynamic Skill Taxonomy, Excel Mapper & Upload Pipeline, Raw Log Viewer.
   * **Milestone 2 (Sprint 3):** Student 360° Dashboard, Subject Bar Graphs, Batch PR/NPR Pie Chart, Strong/Weak Areas.
   * **Milestone 3 (Sprints 4–6):** Infosys/Cognizant Multi-Criteria Filter, Weighted Role Match %, Historical Growth Timeline.