# Firefly Meeting Automation - Complete Flow Documentation

## Project Overview

**Service**: `meeting-service` (Python FastAPI)
**Database**: PostgreSQL with stored procedures
**Event Bus**: RabbitMQ
**AI Integration**: External AI Agent Service (9 agents)
**Purpose**: Automate meeting scheduling, transcription, AI extraction (174 parameters), and data validation

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OPERATION USER                                   │
│  (Can access validation screen for 174 extracted parameters)            │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ POST /api/meetings/schedule
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    MEETING SERVICE (Python FastAPI)                      │
│  ┌──────────────────────────────────────────────────────────────────────┤
│  │ 1. Call sp_schedule_meeting(client_id, advisor_id, ...)             │
│  │    → Returns: (error_number, error_message, next_action)            │
│  │ 2. If successful: Create meeting in Firefly                          │
│  │ 3. Update DB: sp_update_meeting_firefly_id(...)                     │
│  │ 4. Publish event: "meeting.scheduled"                               │
│  └──────────────────────────────────────────────────────────────────────┤
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ Webhook: meeting.completed
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              FIREFLY WEBHOOK (POST /webhooks/firefly)                    │
│  ┌──────────────────────────────────────────────────────────────────────┤
│  │ 1. Receive: meeting.completed event                                  │
│  │ 2. Call sp_update_meeting_status(firefly_id, 'completed')           │
│  │ 3. Fetch transcript from Firefly                                     │
│  │ 4. Call sp_save_transcript(meeting_id, transcript_text)             │
│  │ 5. Publish event: "meeting.transcribed"                             │
│  └──────────────────────────────────────────────────────────────────────┤
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ Event: meeting.transcribed
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           TRANSCRIPT PROCESSOR WORKER (Python)                           │
│  ┌──────────────────────────────────────────────────────────────────────┤
│  │ 1. Consume event: meeting.transcribed                                │
│  │ 2. Call fn_get_meeting_for_extraction(meeting_id)                   │
│  │    → Returns: client_id, agenda, agents_to_use[]                    │
│  │ 3. Submit to AI Service:                                             │
│  │    POST /extract                                                     │
│  │    {                                                                 │
│  │      client_id, transcript, meeting_id, meeting_date,               │
│  │      agents: [DemographicsAgent, FinanceAgent, ...]                 │
│  │    }                                                                 │
│  │ 4. Poll for results (max 5 min)                                      │
│  │ 5. On completion: Publish "extraction.completed"                    │
│  └──────────────────────────────────────────────────────────────────────┤
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ POST /extract
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            AI AGENT SERVICE (External Project)                           │
│  ┌──────────────────────────────────────────────────────────────────────┤
│  │ Agents: DemographicsAgent, FinanceAgent, GoalsAgent,                │
│  │         ProfessionalAgent, ScheduleAgent, QualitativeAgent,         │
│  │         TaskAgent, FeedbackAgent, SystemResolver                    │
│  │                                                                      │
│  │ Returns: {                                                           │
│  │   job_id, client_id, provider, model, extracted_at,                │
│  │   duration_seconds, total_fields: 174,                             │
│  │   fields: { "1": {value, confidence, agent, ...}, ... }            │
│  │ }                                                                    │
│  └──────────────────────────────────────────────────────────────────────┤
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ Event: extraction.completed
                             ▼
        ┌────────────────────┴────────────────────┐
        │                                          │
        ▼                                          ▼
┌──────────────────────────┐        ┌──────────────────────────────┐
│ EVENT A:                 │        │ EVENT B:                      │
│ "extraction.save"        │        │ "extraction.summarize"        │
│                          │        │                               │
│ DATA PERSISTENCE WORKER  │        │ SUMMARY WORKER                │
│ ┌────────────────────────┤        │ ┌─────────────────────────────┤
│ │ 1. Save raw extraction │        │ │ 1. Call Summary Agent       │
│ │    sp_save_extraction  │        │ │    (separate AI call)       │
│ │ 2. Save by domain:     │        │ │ 2. Generate insights        │
│ │    sp_save_demographics│        │ │ 3. Extract action items     │
│ │    sp_save_financials  │        │ │ 4. Save summary:            │
│ │    sp_save_goals       │        │ │    sp_save_summary()        │
│ │    sp_save_qualitative │        │ │ 5. Publish "summary.saved"  │
│ │ 3. Publish "data.saved"│        │ │                             │
│ └────────────────────────┤        │ └─────────────────────────────┤
└──────────────────────────┘        └──────────────────────────────┘
```

---

## Database Schema

### Core Tables

```sql
-- ==========================================
-- MEETINGS TABLE
-- ==========================================
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    client_id UUID NOT NULL REFERENCES clients(id),
    advisor_id UUID NOT NULL REFERENCES advisors(id),
    
    -- Firefly integration
    firefly_meeting_id VARCHAR(255) UNIQUE,
    firefly_meeting_url TEXT,
    
    -- Meeting details
    scheduled_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_minutes INTEGER NOT NULL,
    agenda TEXT NOT NULL,
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    -- Values: scheduled, in_progress, completed, transcribed, 
    --         extraction_pending, extraction_completed, cancelled, failed
    
    -- Transcript
    transcript_text TEXT,
    transcript_url TEXT,
    transcript_duration_seconds INTEGER,
    
    -- Extraction tracking
    extraction_job_id VARCHAR(255),
    extraction_status VARCHAR(50),
    -- Values: pending, in_progress, completed, failed
    extraction_started_at TIMESTAMP,
    extraction_completed_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT chk_status CHECK (status IN (
        'scheduled', 'in_progress', 'completed', 'transcribed',
        'extraction_pending', 'extraction_completed', 'cancelled', 'failed'
    ))
);

CREATE INDEX idx_meetings_client ON meetings(client_id);
CREATE INDEX idx_meetings_advisor ON meetings(advisor_id);
CREATE INDEX idx_meetings_firefly ON meetings(firefly_meeting_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_scheduled ON meetings(scheduled_at);

-- ==========================================
-- CLIENT EXTRACTIONS (Raw AI Response)
-- ==========================================
CREATE TABLE client_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    client_id UUID NOT NULL REFERENCES clients(id),
    meeting_id UUID NOT NULL REFERENCES meetings(id),
    extraction_job_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- AI Provider metadata
    provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', etc.
    model VARCHAR(100) NOT NULL,   -- 'gpt-5.4', 'claude-opus-4-6', etc.
    extracted_at TIMESTAMP NOT NULL,
    duration_seconds NUMERIC(10, 2) NOT NULL,
    total_fields INTEGER NOT NULL DEFAULT 174,
    
    -- Raw extraction result (JSON)
    raw_data JSONB NOT NULL,
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    
    -- Validation (for operation user)
    validated BOOLEAN DEFAULT FALSE,
    validated_by UUID REFERENCES users(id),
    validated_at TIMESTAMP,
    validation_notes TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_extractions_client ON client_extractions(client_id);
CREATE INDEX idx_extractions_meeting ON client_extractions(meeting_id);
CREATE INDEX idx_extractions_validated ON client_extractions(validated);

-- ==========================================
-- CLIENT DEMOGRAPHICS
-- ==========================================
CREATE TABLE client_demographics (
    client_id UUID PRIMARY KEY REFERENCES clients(id),
    
    -- Fields 1-27 from extraction
    turtle_id VARCHAR(50),
    name VARCHAR(255),
    gender VARCHAR(20),
    age INTEGER,
    marital_status VARCHAR(50),
    spouse_name VARCHAR(255),
    spouse_gender VARCHAR(20),
    spouse_age INTEGER,
    tax_residency VARCHAR(255),
    citizenship VARCHAR(255),
    native_city VARCHAR(100),
    native_state VARCHAR(100),
    current_city VARCHAR(100),
    current_state VARCHAR(100),
    kids_count INTEGER DEFAULT 0,
    returning_from_country VARCHAR(100),
    kids_foreign_citizens BOOLEAN,
    date_of_birth DATE,
    anniversary_date DATE,
    pan_number VARCHAR(10),
    aadhaar_number VARCHAR(12),
    
    -- Metadata
    confidence NUMERIC(3, 2), -- Average confidence of extracted fields
    source VARCHAR(50) DEFAULT 'ai_extraction',
    last_extraction_id UUID REFERENCES client_extractions(id),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- ==========================================
-- CLIENT CONTACTS
-- ==========================================
CREATE TABLE client_contacts (
    client_id UUID PRIMARY KEY REFERENCES clients(id),
    
    -- Fields 20-27
    primary_phone VARCHAR(20),
    secondary_phone VARCHAR(20),
    primary_email VARCHAR(255),
    secondary_email VARCHAR(255),
    nominee_name VARCHAR(255),
    nominee_phone VARCHAR(20),
    beneficiary_name VARCHAR(255),
    beneficiary_phone VARCHAR(20),
    
    -- Metadata
    confidence NUMERIC(3, 2),
    source VARCHAR(50) DEFAULT 'ai_extraction',
    last_extraction_id UUID REFERENCES client_extractions(id),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- CLIENT FINANCIALS
-- ==========================================
CREATE TABLE client_financials (
    client_id UUID PRIMARY KEY REFERENCES clients(id),
    
    -- Fields 28-80 (Income)
    salary_income NUMERIC(15, 2),
    rental_income NUMERIC(15, 2),
    business_income NUMERIC(15, 2),
    other_income NUMERIC(15, 2),
    total_annual_income NUMERIC(15, 2),
    
    -- Expenses
    fixed_expenses NUMERIC(15, 2),
    variable_expenses NUMERIC(15, 2),
    total_monthly_expenses NUMERIC(15, 2),
    
    -- Investments
    equity_investments NUMERIC(15, 2),
    debt_investments NUMERIC(15, 2),
    real_estate_investments NUMERIC(15, 2),
    gold_investments NUMERIC(15, 2),
    crypto_investments NUMERIC(15, 2),
    emergency_fund NUMERIC(15, 2),
    total_investments NUMERIC(15, 2),
    
    -- Assets
    home_value NUMERIC(15, 2),
    vehicle_value NUMERIC(15, 2),
    other_assets NUMERIC(15, 2),
    total_assets NUMERIC(15, 2),
    
    -- Liabilities
    home_loan NUMERIC(15, 2),
    personal_loan NUMERIC(15, 2),
    credit_card_debt NUMERIC(15, 2),
    other_liabilities NUMERIC(15, 2),
    total_liabilities NUMERIC(15, 2),
    
    -- Net worth
    net_worth NUMERIC(15, 2),
    
    -- Metadata
    confidence NUMERIC(3, 2),
    source VARCHAR(50) DEFAULT 'ai_extraction',
    last_extraction_id UUID REFERENCES client_extractions(id),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- CLIENT GOALS
-- ==========================================
CREATE TABLE client_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Fields 81-100
    goal_type VARCHAR(100) NOT NULL,
    -- Values: retirement, education, house_purchase, vacation, 
    --         wedding, emergency_fund, debt_repayment, etc.
    
    goal_name VARCHAR(255),
    description TEXT,
    target_amount NUMERIC(15, 2),
    current_amount NUMERIC(15, 2),
    target_date DATE,
    priority INTEGER DEFAULT 1, -- 1=highest, 5=lowest
    
    -- Goal status
    status VARCHAR(50) DEFAULT 'active',
    -- Values: active, achieved, deferred, cancelled
    
    -- Extraction metadata
    confidence NUMERIC(3, 2),
    source VARCHAR(50) DEFAULT 'ai_extraction',
    extraction_field_id VARCHAR(10), -- e.g., "81", "82"
    last_extraction_id UUID REFERENCES client_extractions(id),
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_client ON client_goals(client_id);
CREATE INDEX idx_goals_status ON client_goals(status);

-- ==========================================
-- CLIENT PROFESSIONAL
-- ==========================================
CREATE TABLE client_professional (
    client_id UUID PRIMARY KEY REFERENCES clients(id),
    
    -- Fields 101-147
    employment_status VARCHAR(50),
    -- Values: salaried, self_employed, business_owner, freelancer, retired
    
    company_name VARCHAR(255),
    designation VARCHAR(255),
    years_of_experience INTEGER,
    industry VARCHAR(100),
    
    -- Education
    highest_qualification VARCHAR(100),
    specialization VARCHAR(100),
    
    -- Career plans
    career_change_planned BOOLEAN,
    retirement_age INTEGER,
    
    -- Metadata
    confidence NUMERIC(3, 2),
    source VARCHAR(50) DEFAULT 'ai_extraction',
    last_extraction_id UUID REFERENCES client_extractions(id),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- CLIENT QUALITATIVE
-- ==========================================
CREATE TABLE client_qualitative (
    client_id UUID PRIMARY KEY REFERENCES clients(id),
    
    -- Fields 148-158 (stored as arrays/JSONB)
    areas_of_interest TEXT[], -- e.g., ['retirement', 'tax_planning']
    financial_biases TEXT[],   -- e.g., ['risk_averse', 'prefers_fixed_deposits']
    investing_style TEXT[],    -- e.g., ['long_term_investor', 'value_investor']
    likes TEXT[],              -- e.g., ['structured_planning', 'safety_buffers']
    dislikes TEXT[],           -- e.g., ['complexity', 'high_risk']
    
    -- Ratings (H/M/L)
    tech_savviness VARCHAR(1) CHECK (tech_savviness IN ('H', 'M', 'L')),
    execution_capability VARCHAR(1) CHECK (execution_capability IN ('H', 'M', 'L')),
    
    behavioural_traits TEXT[], -- e.g., ['proactive', 'detail_oriented']
    
    -- Risk profile
    risk_appetite VARCHAR(50), -- conservative, moderate, aggressive
    
    -- Metadata
    confidence NUMERIC(3, 2),
    source VARCHAR(50) DEFAULT 'ai_extraction',
    last_extraction_id UUID REFERENCES client_extractions(id),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- MEETING SUMMARIES (From Summary Agent)
-- ==========================================
CREATE TABLE meeting_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Summary content
    executive_summary TEXT NOT NULL,
    key_points TEXT[], -- Array of key discussion points
    decisions_made TEXT[], -- Decisions/agreements
    
    -- Sentiment
    client_sentiment VARCHAR(50), -- positive, neutral, concerned, confused
    advisor_notes TEXT,
    
    -- AI metadata
    generated_by_model VARCHAR(100),
    generation_duration_seconds NUMERIC(10, 2),
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) DEFAULT 'summary_agent'
);

CREATE INDEX idx_summaries_meeting ON meeting_summaries(meeting_id);
CREATE INDEX idx_summaries_client ON meeting_summaries(client_id);

-- ==========================================
-- MEETING ACTION ITEMS (From Summary Agent)
-- ==========================================
CREATE TABLE meeting_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Action details
    action_type VARCHAR(50) NOT NULL,
    -- Values: follow_up_call, document_submission, investment_action, 
    --         review_plan, schedule_next_meeting
    
    description TEXT NOT NULL,
    assigned_to UUID REFERENCES users(id), -- advisor or operation user
    due_date DATE,
    priority VARCHAR(20) DEFAULT 'medium', -- high, medium, low
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    -- Values: pending, in_progress, completed, cancelled
    
    completed_at TIMESTAMP,
    completion_notes TEXT,
    
    -- Extraction metadata
    confidence NUMERIC(3, 2),
    extracted_from_transcript BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_items_meeting ON meeting_action_items(meeting_id);
CREATE INDEX idx_action_items_status ON meeting_action_items(status);
CREATE INDEX idx_action_items_assigned ON meeting_action_items(assigned_to);

-- ==========================================
-- MEETING AGENT CONFIGURATION
-- ==========================================
CREATE TABLE meeting_agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_type VARCHAR(100) NOT NULL, -- 'initial_consultation', 'review', 'goal_planning'
    
    agents_to_use TEXT[] NOT NULL,
    -- e.g., ['DemographicsAgent', 'FinanceAgent', 'GoalsAgent']
    
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_default_per_type UNIQUE (meeting_type, is_default) 
        WHERE is_default = TRUE
);

-- Insert defaults
INSERT INTO meeting_agent_configs (meeting_type, agents_to_use, is_default) VALUES
('initial_consultation', ARRAY[
    'DemographicsAgent', 'FinanceAgent', 'GoalsAgent', 
    'ProfessionalAgent', 'QualitativeAgent', 'SystemResolver'
], TRUE),
('financial_review', ARRAY[
    'FinanceAgent', 'GoalsAgent', 'TaskAgent', 'FeedbackAgent', 'SystemResolver'
], TRUE),
('goal_planning', ARRAY[
    'GoalsAgent', 'FinanceAgent', 'ScheduleAgent', 'TaskAgent', 'SystemResolver'
], TRUE);
```

---

## Stored Procedures

### 1. Schedule Meeting

```sql
CREATE OR REPLACE FUNCTION sp_schedule_meeting(
    p_client_id UUID,
    p_advisor_id UUID,
    p_scheduled_at TIMESTAMP,
    p_duration_minutes INTEGER,
    p_agenda TEXT,
    p_created_by UUID,
    OUT o_meeting_id UUID,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Initialize output
    o_error_number := 0;
    o_error_message := NULL;
    o_next_action := NULL;
    
    -- Validate client exists
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND is_active = TRUE) THEN
        o_error_number := 1001;
        o_error_message := 'Client not found or inactive';
        o_next_action := 'verify_client_id';
        RETURN;
    END IF;
    
    -- Validate advisor exists
    IF NOT EXISTS (SELECT 1 FROM advisors WHERE id = p_advisor_id AND is_active = TRUE) THEN
        o_error_number := 1002;
        o_error_message := 'Advisor not found or inactive';
        o_next_action := 'verify_advisor_id';
        RETURN;
    END IF;
    
    -- Validate scheduled time (must be in future)
    IF p_scheduled_at <= NOW() THEN
        o_error_number := 1003;
        o_error_message := 'Scheduled time must be in the future';
        o_next_action := 'select_future_time';
        RETURN;
    END IF;
    
    -- Check for scheduling conflicts (advisor double-booked)
    IF EXISTS (
        SELECT 1 FROM meetings
        WHERE advisor_id = p_advisor_id
          AND status NOT IN ('cancelled', 'failed')
          AND (
              -- New meeting starts during existing meeting
              (p_scheduled_at BETWEEN scheduled_at AND scheduled_at + (duration_minutes * INTERVAL '1 minute'))
              OR
              -- Existing meeting starts during new meeting
              (scheduled_at BETWEEN p_scheduled_at AND p_scheduled_at + (p_duration_minutes * INTERVAL '1 minute'))
          )
    ) THEN
        o_error_number := 1004;
        o_error_message := 'Advisor has a conflicting meeting at this time';
        o_next_action := 'choose_different_time';
        RETURN;
    END IF;
    
    -- Create meeting
    INSERT INTO meetings (
        client_id,
        advisor_id,
        scheduled_at,
        duration_minutes,
        agenda,
        status,
        created_by
    ) VALUES (
        p_client_id,
        p_advisor_id,
        p_scheduled_at,
        p_duration_minutes,
        p_agenda,
        'scheduled',
        p_created_by
    )
    RETURNING id INTO o_meeting_id;
    
    -- Success
    o_error_number := 0;
    o_error_message := 'Meeting scheduled successfully';
    o_next_action := 'create_firefly_meeting';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Database error: ' || SQLERRM;
        o_next_action := 'retry_or_contact_support';
END;
$$;
```

### 2. Update Meeting with Firefly ID

```sql
CREATE OR REPLACE FUNCTION sp_update_meeting_firefly_id(
    p_meeting_id UUID,
    p_firefly_meeting_id VARCHAR(255),
    p_firefly_meeting_url TEXT,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    o_error_number := 0;
    
    -- Update meeting
    UPDATE meetings
    SET 
        firefly_meeting_id = p_firefly_meeting_id,
        firefly_meeting_url = p_firefly_meeting_url,
        updated_at = NOW()
    WHERE id = p_meeting_id;
    
    IF NOT FOUND THEN
        o_error_number := 2001;
        o_error_message := 'Meeting not found';
        o_next_action := 'verify_meeting_id';
        RETURN;
    END IF;
    
    o_error_message := 'Firefly meeting ID updated';
    o_next_action := 'publish_scheduled_event';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Database error: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 3. Update Meeting Status

```sql
CREATE OR REPLACE FUNCTION sp_update_meeting_status(
    p_firefly_meeting_id VARCHAR(255),
    p_status VARCHAR(50),
    p_started_at TIMESTAMP DEFAULT NULL,
    p_ended_at TIMESTAMP DEFAULT NULL,
    OUT o_meeting_id UUID,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    o_error_number := 0;
    
    -- Update meeting status
    UPDATE meetings
    SET 
        status = p_status,
        started_at = COALESCE(p_started_at, started_at),
        ended_at = COALESCE(p_ended_at, ended_at),
        updated_at = NOW()
    WHERE firefly_meeting_id = p_firefly_meeting_id
    RETURNING id INTO o_meeting_id;
    
    IF NOT FOUND THEN
        o_error_number := 2002;
        o_error_message := 'Meeting not found for Firefly ID: ' || p_firefly_meeting_id;
        o_next_action := 'verify_firefly_id';
        RETURN;
    END IF;
    
    o_error_message := 'Meeting status updated to: ' || p_status;
    
    -- Determine next action based on status
    CASE p_status
        WHEN 'completed' THEN o_next_action := 'fetch_transcript';
        WHEN 'transcribed' THEN o_next_action := 'start_extraction';
        WHEN 'cancelled' THEN o_next_action := 'send_cancellation_notification';
        ELSE o_next_action := 'continue';
    END CASE;
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Database error: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 4. Save Transcript

```sql
CREATE OR REPLACE FUNCTION sp_save_transcript(
    p_meeting_id UUID,
    p_transcript_text TEXT,
    p_transcript_url TEXT,
    p_duration_seconds INTEGER,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    o_error_number := 0;
    
    -- Update meeting with transcript
    UPDATE meetings
    SET 
        transcript_text = p_transcript_text,
        transcript_url = p_transcript_url,
        transcript_duration_seconds = p_duration_seconds,
        status = 'transcribed',
        extraction_status = 'pending',
        updated_at = NOW()
    WHERE id = p_meeting_id;
    
    IF NOT FOUND THEN
        o_error_number := 2003;
        o_error_message := 'Meeting not found';
        o_next_action := 'verify_meeting_id';
        RETURN;
    END IF;
    
    o_error_message := 'Transcript saved successfully';
    o_next_action := 'publish_transcribed_event';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Database error: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 5. Get Meeting for Extraction

```sql
CREATE OR REPLACE FUNCTION fn_get_meeting_for_extraction(p_meeting_id UUID)
RETURNS TABLE (
    client_id UUID,
    agenda TEXT,
    scheduled_at TIMESTAMP,
    agents_to_use TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.client_id,
        m.agenda,
        m.scheduled_at,
        COALESCE(
            mac.agents_to_use,
            -- Default agents if no config found
            ARRAY[
                'DemographicsAgent', 'FinanceAgent', 'GoalsAgent',
                'ProfessionalAgent', 'ScheduleAgent', 'QualitativeAgent',
                'TaskAgent', 'FeedbackAgent', 'SystemResolver'
            ]
        ) AS agents_to_use
    FROM meetings m
    LEFT JOIN meeting_agent_configs mac 
        ON mac.meeting_type = 
            CASE 
                WHEN m.agenda ILIKE '%initial%' THEN 'initial_consultation'
                WHEN m.agenda ILIKE '%review%' THEN 'financial_review'
                WHEN m.agenda ILIKE '%goal%' THEN 'goal_planning'
                ELSE 'initial_consultation'
            END
        AND mac.is_default = TRUE
    WHERE m.id = p_meeting_id;
END;
$$;
```

### 6. Save Extraction Result

```sql
CREATE OR REPLACE FUNCTION sp_save_extraction(
    p_client_id UUID,
    p_meeting_id UUID,
    p_extraction_job_id VARCHAR(255),
    p_provider VARCHAR(50),
    p_model VARCHAR(100),
    p_extracted_at TIMESTAMP,
    p_duration_seconds NUMERIC,
    p_total_fields INTEGER,
    p_raw_data JSONB,
    OUT o_extraction_id UUID,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    o_error_number := 0;
    
    -- Insert extraction record
    INSERT INTO client_extractions (
        client_id,
        meeting_id,
        extraction_job_id,
        provider,
        model,
        extracted_at,
        duration_seconds,
        total_fields,
        raw_data
    ) VALUES (
        p_client_id,
        p_meeting_id,
        p_extraction_job_id,
        p_provider,
        p_model,
        p_extracted_at,
        p_duration_seconds,
        p_total_fields,
        p_raw_data
    )
    RETURNING id INTO o_extraction_id;
    
    -- Update meeting status
    UPDATE meetings
    SET 
        status = 'extraction_completed',
        extraction_status = 'completed',
        extraction_completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_meeting_id;
    
    o_error_message := 'Extraction saved successfully';
    o_next_action := 'process_by_domain';
    
EXCEPTION
    WHEN unique_violation THEN
        o_error_number := 3001;
        o_error_message := 'Extraction job ID already exists';
        o_next_action := 'check_duplicate';
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Database error: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 7. Save Demographics

```sql
CREATE OR REPLACE FUNCTION sp_save_demographics(
    p_client_id UUID,
    p_extraction_id UUID,
    p_data JSONB, -- Contains all demographic fields
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_confidence NUMERIC;
BEGIN
    o_error_number := 0;
    
    -- Calculate average confidence from extracted fields
    v_confidence := (
        SELECT AVG((value->>'confidence')::NUMERIC)
        FROM jsonb_each(p_data)
        WHERE (value->>'confidence')::NUMERIC > 0
    );
    
    -- Upsert demographics
    INSERT INTO client_demographics (
        client_id,
        turtle_id,
        name,
        gender,
        age,
        marital_status,
        spouse_name,
        date_of_birth,
        native_city,
        native_state,
        current_city,
        current_state,
        kids_count,
        pan_number,
        aadhaar_number,
        confidence,
        last_extraction_id
    ) VALUES (
        p_client_id,
        p_data->'1'->>'value',
        p_data->'2'->>'value',
        p_data->'3'->>'value',
        (p_data->'4'->>'value')::INTEGER,
        p_data->'5'->>'value',
        p_data->'6'->>'value',
        (p_data->'16'->>'value')::DATE,
        p_data->'11'->>'value',
        p_data->'11'->>'value',
        p_data->'12'->>'value',
        p_data->'12'->>'value',
        (p_data->'13'->>'value')::INTEGER,
        p_data->'18'->>'value',
        p_data->'19'->>'value',
        v_confidence,
        p_extraction_id
    )
    ON CONFLICT (client_id) DO UPDATE SET
        turtle_id = EXCLUDED.turtle_id,
        name = COALESCE(EXCLUDED.name, client_demographics.name),
        gender = COALESCE(EXCLUDED.gender, client_demographics.gender),
        age = COALESCE(EXCLUDED.age, client_demographics.age),
        marital_status = COALESCE(EXCLUDED.marital_status, client_demographics.marital_status),
        spouse_name = COALESCE(EXCLUDED.spouse_name, client_demographics.spouse_name),
        date_of_birth = COALESCE(EXCLUDED.date_of_birth, client_demographics.date_of_birth),
        native_city = COALESCE(EXCLUDED.native_city, client_demographics.native_city),
        native_state = COALESCE(EXCLUDED.native_state, client_demographics.native_state),
        current_city = COALESCE(EXCLUDED.current_city, client_demographics.current_city),
        current_state = COALESCE(EXCLUDED.current_state, client_demographics.current_state),
        kids_count = COALESCE(EXCLUDED.kids_count, client_demographics.kids_count),
        pan_number = COALESCE(EXCLUDED.pan_number, client_demographics.pan_number),
        aadhaar_number = COALESCE(EXCLUDED.aadhaar_number, client_demographics.aadhaar_number),
        confidence = EXCLUDED.confidence,
        last_extraction_id = EXCLUDED.last_extraction_id,
        updated_at = NOW();
    
    o_error_message := 'Demographics saved';
    o_next_action := 'save_contacts';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Error saving demographics: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 8. Save Financials

```sql
CREATE OR REPLACE FUNCTION sp_save_financials(
    p_client_id UUID,
    p_extraction_id UUID,
    p_data JSONB,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_confidence NUMERIC;
BEGIN
    o_error_number := 0;
    
    v_confidence := (
        SELECT AVG((value->>'confidence')::NUMERIC)
        FROM jsonb_each(p_data)
        WHERE (value->>'confidence')::NUMERIC > 0
    );
    
    INSERT INTO client_financials (
        client_id,
        salary_income,
        rental_income,
        business_income,
        total_annual_income,
        fixed_expenses,
        variable_expenses,
        total_monthly_expenses,
        equity_investments,
        debt_investments,
        emergency_fund,
        total_investments,
        home_value,
        vehicle_value,
        total_assets,
        home_loan,
        personal_loan,
        credit_card_debt,
        total_liabilities,
        net_worth,
        confidence,
        last_extraction_id
    ) VALUES (
        p_client_id,
        (p_data->'28'->>'value')::NUMERIC,
        (p_data->'29'->>'value')::NUMERIC,
        (p_data->'30'->>'value')::NUMERIC,
        (p_data->'35'->>'value')::NUMERIC,
        (p_data->'38'->>'value')::NUMERIC,
        (p_data->'46'->>'value')::NUMERIC,
        (p_data->'54'->>'value')::NUMERIC,
        (p_data->'56'->>'value')::NUMERIC,
        (p_data->'57'->>'value')::NUMERIC,
        (p_data->'59'->>'value')::NUMERIC,
        (p_data->'64'->>'value')::NUMERIC,
        (p_data->'66'->>'value')::NUMERIC,
        (p_data->'67'->>'value')::NUMERIC,
        (p_data->'70'->>'value')::NUMERIC,
        (p_data->'71'->>'value')::NUMERIC,
        (p_data->'72'->>'value')::NUMERIC,
        (p_data->'73'->>'value')::NUMERIC,
        (p_data->'77'->>'value')::NUMERIC,
        (p_data->'80'->>'value')::NUMERIC,
        v_confidence,
        p_extraction_id
    )
    ON CONFLICT (client_id) DO UPDATE SET
        salary_income = COALESCE(EXCLUDED.salary_income, client_financials.salary_income),
        rental_income = COALESCE(EXCLUDED.rental_income, client_financials.rental_income),
        business_income = COALESCE(EXCLUDED.business_income, client_financials.business_income),
        total_annual_income = COALESCE(EXCLUDED.total_annual_income, client_financials.total_annual_income),
        fixed_expenses = COALESCE(EXCLUDED.fixed_expenses, client_financials.fixed_expenses),
        variable_expenses = COALESCE(EXCLUDED.variable_expenses, client_financials.variable_expenses),
        equity_investments = COALESCE(EXCLUDED.equity_investments, client_financials.equity_investments),
        debt_investments = COALESCE(EXCLUDED.debt_investments, client_financials.debt_investments),
        emergency_fund = COALESCE(EXCLUDED.emergency_fund, client_financials.emergency_fund),
        confidence = EXCLUDED.confidence,
        last_extraction_id = EXCLUDED.last_extraction_id,
        updated_at = NOW();
    
    o_error_message := 'Financials saved';
    o_next_action := 'save_goals';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Error saving financials: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 9. Save Goals

```sql
CREATE OR REPLACE FUNCTION sp_save_goals(
    p_client_id UUID,
    p_extraction_id UUID,
    p_data JSONB,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_field_key TEXT;
    v_field_data JSONB;
    v_goal_id UUID;
BEGIN
    o_error_number := 0;
    
    -- Iterate through fields 81-100 (goal fields)
    FOR v_field_key, v_field_data IN 
        SELECT * FROM jsonb_each(p_data)
        WHERE (key::INTEGER BETWEEN 81 AND 100)
          AND value->>'value' IS NOT NULL
    LOOP
        -- Insert or update goal
        INSERT INTO client_goals (
            client_id,
            goal_type,
            goal_name,
            description,
            target_amount,
            confidence,
            extraction_field_id,
            last_extraction_id
        ) VALUES (
            p_client_id,
            v_field_data->>'attribute',
            v_field_data->>'attribute',
            v_field_data->>'source',
            (v_field_data->>'value')::NUMERIC,
            (v_field_data->>'confidence')::NUMERIC,
            v_field_key,
            p_extraction_id
        )
        ON CONFLICT (client_id, extraction_field_id) 
        WHERE extraction_field_id IS NOT NULL
        DO UPDATE SET
            target_amount = COALESCE(EXCLUDED.target_amount, client_goals.target_amount),
            description = COALESCE(EXCLUDED.description, client_goals.description),
            confidence = EXCLUDED.confidence,
            last_extraction_id = EXCLUDED.last_extraction_id,
            updated_at = NOW();
    END LOOP;
    
    o_error_message := 'Goals saved';
    o_next_action := 'save_qualitative';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Error saving goals: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 10. Save Qualitative Data

```sql
CREATE OR REPLACE FUNCTION sp_save_qualitative(
    p_client_id UUID,
    p_extraction_id UUID,
    p_data JSONB,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_confidence NUMERIC;
    v_areas_of_interest TEXT[];
    v_financial_biases TEXT[];
    v_investing_style TEXT[];
    v_likes TEXT[];
    v_dislikes TEXT[];
    v_behavioural_traits TEXT[];
BEGIN
    o_error_number := 0;
    
    v_confidence := (
        SELECT AVG((value->>'confidence')::NUMERIC)
        FROM jsonb_each(p_data)
        WHERE key::INTEGER BETWEEN 151 AND 158
          AND (value->>'confidence')::NUMERIC > 0
    );
    
    -- Convert JSONB arrays to PostgreSQL arrays
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_data->'151'->'value'))
    INTO v_areas_of_interest;
    
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_data->'152'->'value'))
    INTO v_financial_biases;
    
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_data->'153'->'value'))
    INTO v_investing_style;
    
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_data->'154'->'value'))
    INTO v_likes;
    
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_data->'155'->'value'))
    INTO v_dislikes;
    
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_data->'158'->'value'))
    INTO v_behavioural_traits;
    
    INSERT INTO client_qualitative (
        client_id,
        areas_of_interest,
        financial_biases,
        investing_style,
        likes,
        dislikes,
        tech_savviness,
        execution_capability,
        behavioural_traits,
        confidence,
        last_extraction_id
    ) VALUES (
        p_client_id,
        v_areas_of_interest,
        v_financial_biases,
        v_investing_style,
        v_likes,
        v_dislikes,
        p_data->'156'->>'value',
        p_data->'157'->>'value',
        v_behavioural_traits,
        v_confidence,
        p_extraction_id
    )
    ON CONFLICT (client_id) DO UPDATE SET
        areas_of_interest = COALESCE(EXCLUDED.areas_of_interest, client_qualitative.areas_of_interest),
        financial_biases = COALESCE(EXCLUDED.financial_biases, client_qualitative.financial_biases),
        investing_style = COALESCE(EXCLUDED.investing_style, client_qualitative.investing_style),
        likes = COALESCE(EXCLUDED.likes, client_qualitative.likes),
        dislikes = COALESCE(EXCLUDED.dislikes, client_qualitative.dislikes),
        tech_savviness = COALESCE(EXCLUDED.tech_savviness, client_qualitative.tech_savviness),
        execution_capability = COALESCE(EXCLUDED.execution_capability, client_qualitative.execution_capability),
        behavioural_traits = COALESCE(EXCLUDED.behavioural_traits, client_qualitative.behavioural_traits),
        confidence = EXCLUDED.confidence,
        last_extraction_id = EXCLUDED.last_extraction_id,
        updated_at = NOW();
    
    o_error_message := 'Qualitative data saved';
    o_next_action := 'publish_data_saved_event';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Error saving qualitative data: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 11. Save Summary (From Summary Agent)

```sql
CREATE OR REPLACE FUNCTION sp_save_summary(
    p_meeting_id UUID,
    p_client_id UUID,
    p_executive_summary TEXT,
    p_key_points TEXT[],
    p_decisions_made TEXT[],
    p_client_sentiment VARCHAR(50),
    p_advisor_notes TEXT,
    p_model VARCHAR(100),
    p_duration_seconds NUMERIC,
    OUT o_summary_id UUID,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    o_error_number := 0;
    
    INSERT INTO meeting_summaries (
        meeting_id,
        client_id,
        executive_summary,
        key_points,
        decisions_made,
        client_sentiment,
        advisor_notes,
        generated_by_model,
        generation_duration_seconds
    ) VALUES (
        p_meeting_id,
        p_client_id,
        p_executive_summary,
        p_key_points,
        p_decisions_made,
        p_client_sentiment,
        p_advisor_notes,
        p_model,
        p_duration_seconds
    )
    RETURNING id INTO o_summary_id;
    
    o_error_message := 'Summary saved';
    o_next_action := 'save_action_items';
    
EXCEPTION
    WHEN unique_violation THEN
        o_error_number := 4001;
        o_error_message := 'Summary already exists for this meeting';
        o_next_action := 'update_or_skip';
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Error saving summary: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 12. Save Action Items

```sql
CREATE OR REPLACE FUNCTION sp_save_action_item(
    p_meeting_id UUID,
    p_client_id UUID,
    p_action_type VARCHAR(50),
    p_description TEXT,
    p_assigned_to UUID,
    p_due_date DATE,
    p_priority VARCHAR(20),
    p_confidence NUMERIC,
    OUT o_action_id UUID,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    o_error_number := 0;
    
    INSERT INTO meeting_action_items (
        meeting_id,
        client_id,
        action_type,
        description,
        assigned_to,
        due_date,
        priority,
        confidence
    ) VALUES (
        p_meeting_id,
        p_client_id,
        p_action_type,
        p_description,
        p_assigned_to,
        p_due_date,
        p_priority,
        p_confidence
    )
    RETURNING id INTO o_action_id;
    
    o_error_message := 'Action item saved';
    o_next_action := 'continue_or_finish';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Error saving action item: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

### 13. Cancel Meeting

```sql
CREATE OR REPLACE FUNCTION sp_cancel_meeting(
    p_meeting_id UUID,
    p_cancelled_by UUID,
    p_cancellation_reason TEXT,
    OUT o_error_number INTEGER,
    OUT o_error_message TEXT,
    OUT o_next_action TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_firefly_meeting_id VARCHAR(255);
    v_status VARCHAR(50);
BEGIN
    o_error_number := 0;
    
    -- Get current meeting details
    SELECT firefly_meeting_id, status
    INTO v_firefly_meeting_id, v_status
    FROM meetings
    WHERE id = p_meeting_id;
    
    IF NOT FOUND THEN
        o_error_number := 2004;
        o_error_message := 'Meeting not found';
        o_next_action := 'verify_meeting_id';
        RETURN;
    END IF;
    
    -- Check if meeting can be cancelled
    IF v_status IN ('completed', 'transcribed', 'extraction_completed') THEN
        o_error_number := 2005;
        o_error_message := 'Cannot cancel completed meeting';
        o_next_action := 'contact_admin';
        RETURN;
    END IF;
    
    -- Update meeting status
    UPDATE meetings
    SET 
        status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_meeting_id;
    
    -- Log cancellation (could be separate table)
    -- INSERT INTO meeting_cancellations ...
    
    o_error_message := 'Meeting cancelled';
    o_next_action := 'cancel_in_firefly';
    
EXCEPTION
    WHEN OTHERS THEN
        o_error_number := 9999;
        o_error_message := 'Error cancelling meeting: ' || SQLERRM;
        o_next_action := 'retry';
END;
$$;
```

---

## Complete Flow (Step-by-Step)

### Phase 1: Schedule Meeting

```
1. Operation user calls API: POST /api/meetings/schedule
   {
     "client_id": "uuid",
     "advisor_id": "uuid",
     "scheduled_at": "2026-05-20T10:00:00Z",
     "duration_minutes": 60,
     "agenda": "Financial Planning Discussion"
   }

2. Meeting service calls: sp_schedule_meeting()
   → Returns: (meeting_id, error_number=0, error_message, next_action='create_firefly_meeting')

3. If error_number != 0:
   → Return error to user
   → STOP

4. Create meeting in Firefly (GraphQL API)
   → Get firefly_meeting_id and firefly_meeting_url

5. Update DB: sp_update_meeting_firefly_id()
   → Returns: (error_number=0, next_action='publish_scheduled_event')

6. Publish event: "meeting.scheduled"
   {
     "meeting_id": "uuid",
     "client_id": "uuid",
     "advisor_id": "uuid",
     "firefly_meeting_url": "https://..."
   }

7. Return response to user:
   {
     "success": true,
     "meeting_id": "uuid",
     "firefly_url": "https://...",
     "scheduled_at": "2026-05-20T10:00:00Z"
   }
```

### Phase 2: Meeting Completion

```
1. Firefly sends webhook: POST /webhooks/firefly
   {
     "event_type": "meeting.completed",
     "meeting_id": "firefly-id-123",
     "timestamp": "2026-05-20T11:00:00Z"
   }

2. Webhook handler calls: sp_update_meeting_status()
   → Returns: (meeting_id, error_number=0, next_action='fetch_transcript')

3. Wait 2-3 minutes for Firefly to process transcript

4. Firefly sends webhook: POST /webhooks/firefly
   {
     "event_type": "transcript.ready",
     "meeting_id": "firefly-id-123",
     "transcript_url": "https://..."
   }

5. Fetch transcript text from Firefly API

6. Call: sp_save_transcript(meeting_id, transcript_text, ...)
   → Returns: (error_number=0, next_action='publish_transcribed_event')

7. Publish event: "meeting.transcribed"
   {
     "meeting_id": "uuid",
     "client_id": "uuid",
     "transcript": "full transcript text...",
     "duration_seconds": 3600
   }
```

### Phase 3: AI Extraction

```
1. Transcript Processor Worker consumes: "meeting.transcribed"

2. Call: fn_get_meeting_for_extraction(meeting_id)
   → Returns: {
       client_id: "uuid",
       agenda: "Financial Planning",
       scheduled_at: "2026-05-20T10:00:00Z",
       agents_to_use: [
         "DemographicsAgent",
         "FinanceAgent",
         "GoalsAgent",
         "ProfessionalAgent",
         "ScheduleAgent",
         "QualitativeAgent",
         "TaskAgent",
         "FeedbackAgent",
         "SystemResolver"
       ]
     }

3. Submit to AI Agent Service:
   POST http://ai-agent-service:5000/extract
   {
     "client_id": "uuid",
     "transcript": "full transcript...",
     "meeting_id": "uuid",
     "meeting_date": "2026-05-20",
     "agents": ["DemographicsAgent", "FinanceAgent", ...]
   }

4. AI service returns:
   {
     "job_id": "job-xyz-789",
     "status": "queued",
     "estimated_completion_time": "2026-05-20T11:05:00Z"
   }

5. Poll AI service every 10 seconds:
   GET http://ai-agent-service:5000/extract/job-xyz-789
   
   While status != 'completed' and timeout < 5 minutes:
     → Wait 10 seconds
     → Poll again

6. When complete, get result:
   {
     "status": "completed",
     "result": {
       "client_id": "uuid",
       "provider": "openai",
       "model": "gpt-5.4",
       "extracted_at": "2026-05-20T11:03:25Z",
       "duration_seconds": 93.87,
       "total_fields": 174,
       "fields": {
         "1": {
           "value": "client_2",
           "confidence": 1.0,
           "confidence_level": "exact_quote",
           "source": "System",
           "agent": "SystemResolver",
           "attribute": "T_id",
           "touch_point": "Demographics & Family"
         },
         ... (174 fields total)
       }
     }
   }

7. Publish TWO events in parallel:

   Event A: "extraction.save"
   {
     "meeting_id": "uuid",
     "client_id": "uuid",
     "extraction_result": { ... }
   }

   Event B: "extraction.summarize"
   {
     "meeting_id": "uuid",
     "client_id": "uuid",
     "transcript": "full transcript...",
     "extraction_result": { ... }
   }
```

### Phase 4A: Data Persistence (Event A)

```
1. Data Persistence Worker consumes: "extraction.save"

2. Call: sp_save_extraction()
   → Saves raw extraction to client_extractions table
   → Returns: (extraction_id, error_number=0, next_action='process_by_domain')

3. Transform extraction result to domain-specific data structures

4. Call: sp_save_demographics(client_id, extraction_id, demographics_data)
   → Upserts to client_demographics table
   → Returns: (error_number=0, next_action='save_contacts')

5. Call: sp_save_financials(client_id, extraction_id, financials_data)
   → Upserts to client_financials table
   → Returns: (error_number=0, next_action='save_goals')

6. Call: sp_save_goals(client_id, extraction_id, goals_data)
   → Inserts multiple records to client_goals table
   → Returns: (error_number=0, next_action='save_qualitative')

7. Call: sp_save_qualitative(client_id, extraction_id, qualitative_data)
   → Upserts to client_qualitative table
   → Returns: (error_number=0, next_action='publish_data_saved_event')

8. Publish event: "data.saved"
   {
     "meeting_id": "uuid",
     "client_id": "uuid",
     "extraction_id": "uuid",
     "domains_saved": ["demographics", "financials", "goals", "qualitative"]
   }

9. Log success to console/monitoring
```

### Phase 4B: Summary Generation (Event B)

```
1. Summary Worker consumes: "extraction.summarize"

2. Call Summary Agent (different AI call):
   POST http://ai-agent-service:5000/summarize
   {
     "transcript": "full transcript...",
     "meeting_id": "uuid",
     "client_id": "uuid",
     "extraction_context": { ... }
   }

3. AI returns summary:
   {
     "executive_summary": "Client discussed retirement planning...",
     "key_points": [
       "Client wants to retire at age 45",
       "Current emergency fund insufficient",
       "Needs education corpus for future MBA"
     ],
     "decisions_made": [
       "Start SIP of ₹50,000/month",
       "Review portfolio quarterly",
       "Book next meeting in 3 months"
     ],
     "client_sentiment": "positive",
     "action_items": [
       {
         "type": "document_submission",
         "description": "Submit salary slips and Form 16",
         "due_date": "2026-05-25",
         "priority": "high"
       },
       {
         "type": "investment_action",
         "description": "Start SIP in recommended funds",
         "due_date": "2026-06-01",
         "priority": "high"
       },
       {
         "type": "schedule_next_meeting",
         "description": "Quarterly review meeting",
         "due_date": "2026-08-20",
         "priority": "medium"
       }
     ],
     "model": "gpt-5.4",
     "duration_seconds": 12.5
   }

4. Call: sp_save_summary()
   → Saves to meeting_summaries table
   → Returns: (summary_id, error_number=0, next_action='save_action_items')

5. For each action item:
   Call: sp_save_action_item()
   → Saves to meeting_action_items table
   → Returns: (action_id, error_number=0)

6. Publish event: "summary.saved"
   {
     "meeting_id": "uuid",
     "summary_id": "uuid",
     "action_items_count": 3
   }

7. Optionally send notifications:
   → Email to advisor with summary
   → Slack notification to operations team
```

### Phase 5: Validation (Operation User)

```
1. Operation user accesses validation screen:
   GET /api/extractions/{extraction_id}/validate

2. Screen shows 174 parameters organized by domain:
   - Demographics (fields 1-27)
   - Contacts (fields 20-27)
   - Financials (fields 28-80)
   - Goals (fields 81-100)
   - Professional (fields 101-147)
   - Qualitative (fields 148-158)
   - Special Services (fields 159-163)
   - Advisor Info (fields 164-168)
   - Campaigns (fields 169-172)
   - Engagement (fields 173-174)

3. Each field shows:
   - Value
   - Confidence score
   - Confidence level
   - Source (quote from transcript)
   - Agent that extracted it

4. Operation user can:
   - Accept field (mark as validated)
   - Edit value
   - Reject field
   - Add notes

5. When validation complete:
   POST /api/extractions/{extraction_id}/validate
   {
     "validated_by": "user-id",
     "validation_notes": "Verified all demographics",
     "changes": [
       {
         "field_id": "4",
         "old_value": "27",
         "new_value": "28",
         "reason": "Client birthday was yesterday"
       }
     ]
   }

6. Update: client_extractions.validated = TRUE

7. Apply validated changes to domain tables

8. Publish event: "extraction.validated"
```

---

## Cancellation Handling

### Scenario 1: Cancel Before Meeting Starts

```
1. User calls: DELETE /api/meetings/{meeting_id}

2. Call: sp_cancel_meeting(meeting_id, cancelled_by, reason)
   → Returns: (error_number=0, next_action='cancel_in_firefly')

3. Cancel in Firefly:
   mutation {
     cancelMeeting(meetingId: "firefly-id-123") {
       success
     }
   }

4. Publish event: "meeting.cancelled"
   {
     "meeting_id": "uuid",
     "cancelled_by": "user-id",
     "cancelled_at": "2026-05-19T14:00:00Z",
     "reason": "Client rescheduled"
   }

5. Send notifications:
   → Email to client and advisor
   → Update calendar
```

### Scenario 2: Meeting Cancelled in Firefly

```
1. Firefly sends webhook:
   {
     "event_type": "meeting.cancelled",
     "meeting_id": "firefly-id-123",
     "timestamp": "..."
   }

2. Call: sp_update_meeting_status(firefly_id, 'cancelled')
   → Returns: (meeting_id, error_number=0, next_action='send_cancellation_notification')

3. Publish event: "meeting.cancelled"

4. No extraction happens
```

---

## Retry Policies & Error Handling

### Worker Retry Configuration

```python
# In worker code
RETRY_CONFIG = {
    'max_retries': 3,
    'retry_delay': 10,  # seconds
    'exponential_backoff': True,
    'max_delay': 300,  # 5 minutes
}

# Retry scenarios:
# 1. Network failure connecting to AI service
# 2. AI service returns 5xx error
# 3. Database connection lost
# 4. Extraction timeout (after 5 minutes)
```

### Dead Letter Queue (DLQ)

```
Queue: meeting.transcribed
  ↓
Consumer: transcript-processor
  ↓
On failure (after 3 retries):
  ↓
DLQ: meeting.transcribed.dlq

DLQ Processing:
1. Alert operations team (Slack/email)
2. Store failed message in database:
   CREATE TABLE failed_events (
     id UUID PRIMARY KEY,
     queue_name VARCHAR(100),
     event_data JSONB,
     error_message TEXT,
     retry_count INTEGER,
     created_at TIMESTAMP
   )

3. Manual reprocessing:
   - Operation user reviews failed event
   - Fixes issue (e.g., corrupt transcript)
   - Republishes to main queue

4. Automatic retry (optional):
   - Cron job checks failed_events table
   - Republishes events older than 1 hour
   - Max 10 automatic republishes
```

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": 1001,
    "message": "Client not found or inactive",
    "next_action": "verify_client_id",
    "timestamp": "2026-05-20T10:00:00Z",
    "request_id": "req-abc-123"
  }
}
```

---

## Missing Elements (Now Included)

✅ Client and advisor records stored in DB
✅ Fetch via stored procedures
✅ 174 parameters displayed on validation screen (operation users only)
✅ Exact format of AI response (matches 174.txt)
✅ Save provider, model, extraction time, duration
✅ Handle meeting cancellation (before and after scheduling)
✅ Retry policies for failed workers
✅ Dead letter queues for poison messages
✅ Two-fork event pattern (save + summarize)
✅ Summary Agent integration
✅ Action items extraction
✅ Stored procedure pattern (error_number, error_message, next_action)

---

## Next: Implementation Files

This document provides the complete flow. Next steps:
1. Python FastAPI service implementation
2. SQLAlchemy models
3. Worker implementations
4. Firefly API client
5. AI Agent service client

Ready to implement?
