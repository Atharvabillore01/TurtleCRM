"""
Meeting-service proc stubs.

All handlers return ProcResult(result, errormessage, errornumber, nextAction).
Replace handler bodies when real stored procs are ready — public wrappers stay unchanged.

Pre-seeded with one extraction from the 174.txt sample so the validation screen
has live data immediately.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from db.proc_caller import ProcResult, register_proc, call_proc


# ── In-memory stores ──────────────────────────────────────────────────────────

@dataclass
class MeetingRow:
    id: str
    client_id: str
    advisor_id: str
    scheduled_at: str
    duration_minutes: int
    agenda: str
    status: str = "scheduled"
    # enriched display fields
    title: Optional[str] = None
    client_name: Optional[str] = None
    advisor_name: Optional[str] = None
    # multi-advisor support (TODO: map to DB proc columns when ready)
    advisor_ids: list = field(default_factory=list)
    advisor_names: list = field(default_factory=list)
    member: Optional[str] = None          # ops team member who booked
    guests: list = field(default_factory=list)
    notes: Optional[str] = None           # detailsHappened / extra notes
    meeting_url: Optional[str] = None     # Google Meet URL
    # Fireflies
    firefly_meeting_id: Optional[str] = None
    firefly_meeting_url: Optional[str] = None
    # lifecycle timestamps
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    # transcript
    transcript_text: Optional[str] = None
    transcript_url: Optional[str] = None
    transcript_duration_seconds: Optional[int] = None
    # extraction
    extraction_job_id: Optional[str] = None
    extraction_status: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ExtractionRow:
    id: str
    client_id: str
    meeting_id: str
    extraction_job_id: str
    provider: str
    model: str
    extracted_at: str
    duration_seconds: float
    total_fields: int
    raw_data: dict
    validated: bool = False
    validated_by: Optional[str] = None
    validated_at: Optional[str] = None
    validation_notes: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class SummaryRow:
    id: str
    meeting_id: str
    client_id: str
    executive_summary: str
    key_points: list
    decisions_made: list
    client_sentiment: Optional[str]
    advisor_notes: Optional[str]
    generated_by_model: str
    generation_duration_seconds: float
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ActionItemRow:
    id: str
    meeting_id: str
    client_id: str
    action_type: str
    description: str
    priority: str
    due_date: Optional[str]
    assigned_to: Optional[str]
    status: str = "pending"
    confidence: Optional[float] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


_meetings: dict[str, MeetingRow] = {}
_extractions: dict[str, ExtractionRow] = {}
_summaries: dict[str, SummaryRow] = {}
_action_items: list[ActionItemRow] = []
_demographics: dict[str, dict] = {}
_financials: dict[str, dict] = {}
_goals: list[dict] = []
_qualitative: dict[str, dict] = {}


# ── 174-field dummy data (from 174.txt sample) ───────────────────────────────

_DUMMY_174_FIELDS = {
    "1": {"value": "client_2", "confidence": 1.0, "confidence_level": "exact_quote", "source": "System", "agent": "SystemResolver", "attribute": "T_id", "touch_point": "Turtle ID"},
    "2": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Lead/ Client Name", "touch_point": "Demographics & Family"},
    "3": {"value": "Female", "confidence": 0.4, "confidence_level": "indirect", "source": "Advisor addresses client as 'princess' near the end of the first meeting.", "agent": "DemographicsAgent", "attribute": "Lead/ Client Gender", "touch_point": "Demographics & Family"},
    "4": {"value": "27", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "DOB stated as 27/05/1998; advisor also says 'You're currently 27.'", "agent": "DemographicsAgent", "attribute": "Lead/ Client's Age", "touch_point": "Demographics & Family"},
    "5": {"value": "Single", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: 'So you are currently single?' Client later confirms: 'right now I'm a single.'", "agent": "DemographicsAgent", "attribute": "Marital Status", "touch_point": "Demographics & Family"},
    "6": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Spouse Name", "touch_point": "Demographics & Family"},
    "7": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Spouse Gender", "touch_point": "Demographics & Family"},
    "8": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Spouse Age", "touch_point": "Demographics & Family"},
    "9": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Tax Residency (Self, Spouse, Kids)", "touch_point": "Demographics & Family"},
    "10": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Citizenship (Self, Spouse, Kids)", "touch_point": "Demographics & Family"},
    "11": {"value": "Indore, Madhya Pradesh", "confidence": 0.6, "confidence_level": "estimated", "source": "Client: 'I was born in Panvel... Most of my schooling and all was done indore in Madhya Pradesh.'", "agent": "DemographicsAgent", "attribute": "Native (City, State)", "touch_point": "Demographics & Family"},
    "12": {"value": "Bangalore, Karnataka", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Client: 'I'm also based out of Bangalore.'", "agent": "DemographicsAgent", "attribute": "Current Residence (City, State)", "touch_point": "Demographics & Family"},
    "13": {"value": "0", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client is single and discusses childbirth as a future possibility; no children mentioned.", "agent": "DemographicsAgent", "attribute": "Kids (Count)", "touch_point": "Demographics & Family"},
    "14": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Returning from (State, Country)", "touch_point": "Demographics & Family"},
    "15": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Kids as Foreign Citizens (Y/N)", "touch_point": "Demographics & Family"},
    "16": {"value": "27/05/1998", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: 'your date of birth?' Client: '27 05' ... '1998.'", "agent": "DemographicsAgent", "attribute": "Date of Birth", "touch_point": "Demographics & Family"},
    "17": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Anniversary Date", "touch_point": "Demographics & Family"},
    "18": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "PAN (Primary Member)", "touch_point": "Demographics & Family"},
    "19": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Aadhaar (Primary Member)", "touch_point": "Demographics & Family"},
    "20": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Primary Phone", "touch_point": "Contact Details"},
    "21": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Secondary Phone", "touch_point": "Contact Details"},
    "22": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Primary Email Id", "touch_point": "Contact Details"},
    "23": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Secondary Email id", "touch_point": "Contact Details"},
    "24": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Nominee Name", "touch_point": "Contact Details"},
    "25": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Nominee Phone", "touch_point": "Contact Details"},
    "26": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Beneficiary Name", "touch_point": "Contact Details"},
    "27": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Beneficiary Phone", "touch_point": "Contact Details"},
    "28": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Insurance Agent Name (if applicable)", "touch_point": "Contact Details"},
    "29": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Insurance Agent Phone (if applicable)", "touch_point": "Contact Details"},
    "30": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "KC Date", "touch_point": "Acquisition"},
    "31": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Acquisition Source", "touch_point": "Acquisition"},
    "32": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Membership Date", "touch_point": "Acquisition"},
    "33": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Membership Status", "touch_point": "Acquisition"},
    "34": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Membership Renewal Date", "touch_point": "Acquisition"},
    "35": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "KC taker's Name", "touch_point": "Internal"},
    "36": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "KC taker's Attitude", "touch_point": "Internal"},
    "37": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "KC taker's Readiness", "touch_point": "Internal"},
    "38": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "KC taker's Knowledge", "touch_point": "Internal"},
    "39": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "KC taker's Remark", "touch_point": "Internal"},
    "40": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "KC taker's Remark", "touch_point": "Internal"},
    "41": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client Type (Resident/R2I)", "touch_point": "Internal"},
    "42": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Assigned to (Turtle PoC)", "touch_point": "Internal"},
    "43": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Assets Worth ($)", "touch_point": "Finances"},
    "44": {"value": "3785000", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Summing explicit INR assets: bank 12L + EPFO 6L + equities 10L + MF 8.8L + gold 85K.", "agent": "FinanceAgent", "attribute": "Assets Worth (Rs.)", "touch_point": "Finances"},
    "45": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Liabilities ($)", "touch_point": "Finances"},
    "46": {"value": "0", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client: \"I've never taken up any EMIs or anything\"", "agent": "FinanceAgent", "attribute": "Liabilities (Rs.)", "touch_point": "Finances"},
    "47": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Family Income ($)", "touch_point": "Finances"},
    "48": {"value": "265000", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"the amount which gets the bank account monthly is around 2.65\"", "agent": "FinanceAgent", "attribute": "Family Income (Rs.)", "touch_point": "Finances"},
    "49": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Monthly Expenses ($)", "touch_point": "Finances"},
    "50": {"value": "132000", "confidence": 0.95, "confidence_level": "exact_quote", "source": "2nd call: advisor says \"our current expenses... about 1.3 lakh rupees\"", "agent": "FinanceAgent", "attribute": "Monthly Expenses (Rs.)", "touch_point": "Finances"},
    "51": {"value": "Corporate health insurance", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Client: \"I'm using corporate insurance only.\"", "agent": "FinanceAgent", "attribute": "Policy Type", "touch_point": "Finances"},
    "52": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Insurance Company", "touch_point": "Finances"},
    "53": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Policy Name", "touch_point": "Finances"},
    "54": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Purchase Mode (Online/Offline)", "touch_point": "Finances"},
    "55": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Coverage Amount (Rs.)", "touch_point": "Finances"},
    "56": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Premium (Rs.)", "touch_point": "Finances"},
    "57": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Policy Renewal Date (DD/MM/YY)", "touch_point": "Finances"},
    "58": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Coverage Adequacy (H/M/L/Ok)", "touch_point": "Finances"},
    "59": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "HUF (Y/N)", "touch_point": "Finances"},
    "60": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Will Executed (Y/N)", "touch_point": "Finances"},
    "61": {"value": "Y", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Client: \"So I started using a credit card about three months back\"", "agent": "FinanceAgent", "attribute": "Credit Card (Y/N)", "touch_point": "Finances"},
    "62": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Card Name(s)", "touch_point": "Finances"},
    "63": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "CC Issuing Authority (Bank/Amex etc.)", "touch_point": "Finances"},
    "64": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Card Type (Visa/MC/Diners/Amex)", "touch_point": "Finances"},
    "65": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Banking Partner(s)", "touch_point": "Finances"},
    "66": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Account Holder (Self/Spouse/Kid/Parent)", "touch_point": "Finances"},
    "67": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Income Tax Portal Password (hidden)", "touch_point": "Finances"},
    "68": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "ESOPs/RSUs Vested Units", "touch_point": "Finances"},
    "69": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "ESOPs Exercised Units", "touch_point": "Finances"},
    "70": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "FMV ($)", "touch_point": "Finances"},
    "71": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "ESOPs/RSUs Worth ($)", "touch_point": "Finances"},
    "72": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "FMV (Rs.)", "touch_point": "Finances"},
    "73": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "ESOPs/RSUs Worth (Rs.)", "touch_point": "Finances"},
    "74": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Tax Filed till FY", "touch_point": "Finances"},
    "75": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advance Tax paid till (MM/YY)", "touch_point": "Finances"},
    "76": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Penalty Paid in FY", "touch_point": "Finances"},
    "77": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Interest Paid in FY", "touch_point": "Finances"},
    "78": {"value": "2024", "confidence": 0.6, "confidence_level": "estimated", "source": "Client: \"I started taking investments semi seriously about last year\"; meeting is in 2025.", "agent": "FinanceAgent", "attribute": "Investing since (year)", "touch_point": "Finances"},
    "79": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Family Planning", "touch_point": "Life Goals (with Priorities)"},
    "80": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Buying a house", "touch_point": "Life Goals (with Priorities)"},
    "81": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Kids Education", "touch_point": "Life Goals (with Priorities)"},
    "82": {"value": "Financial freedom / retirement at age 45", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Client first said '50. 55 is fair' then corrected: 'I think let's make it 45 there.'", "agent": "GoalsAgent", "attribute": "Retirement Planning", "touch_point": "Life Goals (with Priorities)"},
    "83": {"value": ["Build a corpus for possible further education in ~4 years (20-30L)", "Car purchase in ~2 years (~10L budget)", "International vacations ~3-4L/year", "Career break/sabbatical for one quarter, not before Q3 2026", "Post-retirement: starting a business"], "confidence": 0.6, "confidence_level": "estimated", "source": "Multiple goal discussions across both calls.", "agent": "GoalsAgent", "attribute": "Custom Goals", "touch_point": "Life Goals (with Priorities)"},
    "84": {"value": "Salaried", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Client: \"So I'm a salaried employee and I work as a UX designer.\"", "agent": "ProfessionalAgent", "attribute": "Employment Type (Salaried, Self Employed, On a break, NA)", "touch_point": "Professional Details"},
    "85": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Linkedin Profile", "touch_point": "Professional Details"},
    "86": {"value": "Alteryx", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"What's the organization name?\" Client: \"Alteryx...\"", "agent": "ProfessionalAgent", "attribute": "Works at", "touch_point": "Professional Details"},
    "87": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Alumni (Institute)", "touch_point": "Professional Details"},
    "88": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Alumni (Organization)", "touch_point": "Professional Details"},
    "89": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Annual Income (Self)", "touch_point": "Professional Details"},
    "90": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Annual Income (Spouse)", "touch_point": "Professional Details"},
    "91": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Annual Income (HUF)", "touch_point": "Professional Details"},
    "92": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "From (Destination)", "touch_point": "Travel Dates"},
    "93": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "From (Date)", "touch_point": "Travel Dates"},
    "94": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "To (Destination)", "touch_point": "Travel Dates"},
    "95": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "To (Date)", "touch_point": "Travel Dates"},
    "96": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Days in FY (Autocalculated)", "touch_point": "Travel Dates"},
    "97": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Date of Return", "touch_point": "Travel Dates"},
    "98": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client's Availability (Weekday, Time, Timezone)", "touch_point": "Schedule & Communication"},
    "99": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advisor's Availability (Weekday, Time, Timezone)", "touch_point": "Schedule & Communication"},
    "100": {"value": "Email, Call", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"drop in an email to the Turtle team\" and \"they are going to schedule a call with me\"", "agent": "ScheduleAgent", "attribute": "Preferred mode of communication (Email/WA/Call)", "touch_point": "Schedule & Communication"},
    "101": {"value": "Advisor to prepare and come back with the financial plan in about 3-4 days.", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"Let me do this analysis and give me about three to four days...\"", "agent": "TaskAgent", "attribute": "P0", "touch_point": "Task Priority"},
    "102": {"value": "Advisor to generate and review the client's CAS for mutual fund holdings.", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"I will generate a consolidated account statement for you...\"", "agent": "TaskAgent", "attribute": "P1", "touch_point": "Task Priority"},
    "103": {"value": "Client to check and let the advisor know employer group insurance details.", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"You check and let us know of this.\"", "agent": "TaskAgent", "attribute": "P2", "touch_point": "Task Priority"},
    "104": {"value": "Client to upload the CAS received in email to her Google Drive folder.", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"You can drop in the same share drive...\"", "agent": "TaskAgent", "attribute": "P3", "touch_point": "Task Priority"},
    "105": {"value": "Client to check the likely rental amount for the Howrah property and revert.", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Advisor: \"But just take a look at it.\"", "agent": "TaskAgent", "attribute": "P4", "touch_point": "Task Priority"},
    "106": {"value": ["Advisor to prepare and come back with the financial plan in 3-4 days.", "Advisor to analyze the client's mutual fund portfolio.", "Client to check and share employer group coverage details.", "Client to upload the CAS to Google Drive.", "Client to verify/confirm likely rental income for the Howrah property."], "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Multiple discussed action items across both calls.", "agent": "FeedbackAgent", "attribute": "Action Items", "touch_point": "Custom Fields (text)"},
    "107": {"value": ["What is the client's employer group life insurance coverage?", "Does the employer provide personal accident cover?", "What is the actual rental income potential of the family property?"], "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Open items not resolved during meeting.", "agent": "FeedbackAgent", "attribute": "Open Queries", "touch_point": "Custom Fields (text)"},
    "108": {"value": {"level": "M", "text": "Moderate complexity. Includes retirement, emergency reserve, car purchase, career break, education planning, portfolio consolidation, and insurance verification."}, "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Multiple goals and portfolio cleanup discussed.", "agent": "FeedbackAgent", "attribute": "Case Complexity (H/M/L) + Custom text", "touch_point": "Custom Fields (text)"},
    "109": {"value": "Client asked how to add information between calls; advisor said to email the Turtle team.", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "'you can drop in an email to the Turtle team...'", "agent": "FeedbackAgent", "attribute": "Special Request", "touch_point": "Custom Fields (text)"},
    "110": {"value": "Client feels financial planning has been overwhelming. Investments so far unstructured. No current dependents, no immediate house goal.", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client described overwhelm, anxiety, lack of structure.", "agent": "FeedbackAgent", "attribute": "Special Information", "touch_point": "Custom Fields (text)"},
    "111": {"value": "Client can send any additional information by email to the Turtle team.", "confidence": 0.95, "confidence_level": "exact_quote", "source": "'you can drop in at any point of time, drop in an email to the Turtle team'", "agent": "FeedbackAgent", "attribute": "Special Instructions", "touch_point": "Custom Fields (text)"},
    "112": {"value": ["Data gathering for financial plan", "Identifying goals and timelines", "Retirement planning", "Cash flow and expense review", "Risk management and insurance needs", "Review of existing investments", "Emergency reserve planning", "Car purchase planning"], "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Advisor outlined scope at start of call 1.", "agent": "FeedbackAgent", "attribute": "Consultation Agenda", "touch_point": "Custom Fields (text)"},
    "113": {"value": "Overall sentiment is positive and engaged, with underlying financial anxiety. Client receptive to guidance.", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client said planning was 'very overwhelming,' wanted structure 'to sleep better at night.'", "agent": "FeedbackAgent", "attribute": "Sentiment Analysis", "touch_point": "Custom Fields (text)"},
    "114": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client's feedback on Financial Planner", "touch_point": "Custom Fields (text)"},
    "115": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client's feedback on Tax Advisor", "touch_point": "Custom Fields (text)"},
    "116": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client's feedback on Estate Planner", "touch_point": "Custom Fields (text)"},
    "117": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client's feedback on Banking & Compliance Advisor", "touch_point": "Custom Fields (text)"},
    "118": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client's feedback on Insurance Advisor", "touch_point": "Custom Fields (text)"},
    "119": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Client's feedback on Credit Card Advisor", "touch_point": "Custom Fields (text)"},
    "120": {"value": "Client is thoughtful and cooperative but lacks structure in investing.", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Advisor said to consolidate investments and prefer mutual funds over direct equities.", "agent": "FeedbackAgent", "attribute": "Financial Planner's feedback on Client", "touch_point": "Custom Fields (text)"},
    "121": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Tax Advisor's feedback on Client", "touch_point": "Custom Fields (text)"},
    "122": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Estate Planner's feedback on Client", "touch_point": "Custom Fields (text)"},
    "123": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Insurance Advisor's feedback on Client", "touch_point": "Custom Fields (text)"},
    "124": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Banking & Compliance Advisor's feedback on Client", "touch_point": "Custom Fields (text)"},
    "125": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Credit Card Advisor's feedback on Client", "touch_point": "Custom Fields (text)"},
    "126": {"value": ["Strong monthly surplus relative to expenses.", "Emergency reserve can be funded from existing cash.", "Client is starting planning early in career.", "No financial dependents currently.", "Good credit score mentioned (789)."], "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Advisor said goals can be addressed comfortably within current surplus.", "agent": "FeedbackAgent", "attribute": "Wins", "touch_point": "Custom Fields (text)"},
    "127": {"value": ["Client lacks a structured investment approach.", "Portfolio appears fragmented across many mutual fund schemes and direct equities.", "No personal term insurance or personal medical insurance confirmed.", "Several goals are still ambiguous or not fully quantified."], "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client repeatedly described investing as random; advisor noted 21 mutual fund schemes.", "agent": "FeedbackAgent", "attribute": "Gaps", "touch_point": "Custom Fields (text)"},
    "128": {"value": ["Consolidate and clean up the mutual fund portfolio.", "Avoid fresh direct equity investing; prefer mutual funds.", "Use arbitrage funds for emergency reserve and near-term break corpus.", "Verify employer insurance benefits and assess additional needs."], "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Advisor recommendations on portfolio consolidation, mutual funds, reserve sizing.", "agent": "FeedbackAgent", "attribute": "Suggestions", "touch_point": "Custom Fields (text)"},
    "129": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "PAN (Self)", "touch_point": "Attachments (PDFs)"},
    "130": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Aadhaar (Self)", "touch_point": "Attachments (PDFs)"},
    "131": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "PAN (Spouse)", "touch_point": "Attachments (PDFs)"},
    "132": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Aadhaar (Spouse)", "touch_point": "Attachments (PDFs)"},
    "133": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "PAN (Other)", "touch_point": "Attachments (PDFs)"},
    "134": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Aadhaar (Other)", "touch_point": "Attachments (PDFs)"},
    "135": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Insurance Policies", "touch_point": "Attachments (PDFs)"},
    "136": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Previous Indian Income Tax Return", "touch_point": "Attachments (PDFs)"},
    "137": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Previous Foreign Income Tax Return", "touch_point": "Attachments (PDFs)"},
    "138": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "e-CAS", "touch_point": "Attachments (PDFs)"},
    "139": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Holding Statement", "touch_point": "Attachments (PDFs)"},
    "140": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "ESOPs/RSUs Letter", "touch_point": "Attachments (PDFs)"},
    "141": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Payslip(s)", "touch_point": "Attachments (PDFs)"},
    "142": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Other (Doc. name)", "touch_point": "Attachments (PDFs)"},
    "143": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Deliverables (Financial Plan, Tax Plan etc.)", "touch_point": "Attachments (PDFs)"},
    "144": {"value": "H", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client sought structured financial planning, shared detailed data, attended follow-up review.", "agent": "QualitativeAgent", "attribute": "Turtle Relevance (H/M/L)", "touch_point": "Qualitative Parameters"},
    "145": {"value": "Critical", "confidence": 0.4, "confidence_level": "indirect", "source": "Client said planning felt 'very overwhelming,' investments were 'very random.'", "agent": "QualitativeAgent", "attribute": "Prospect's Attitude (Optimistic/Pessimistic/Critical)", "touch_point": "Qualitative Parameters"},
    "146": {"value": "M", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client understands basics but says 'with investing, I don't have any idea what to do.'", "agent": "QualitativeAgent", "attribute": "Prospect's Financial Acumen (H/M/L)", "touch_point": "Qualitative Parameters"},
    "147": {"value": "N", "confidence": 0.95, "confidence_level": "exact_quote", "source": "Client: \"I'm a salaried employee and I work as a UX designer.\"", "agent": "QualitativeAgent", "attribute": "Prospect's Financial Background (Y/N)", "touch_point": "Qualitative Parameters"},
    "148": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Prospect's Price Sensitivity (Y/N)", "touch_point": "Qualitative Parameters"},
    "149": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Introvert/Extrovert", "touch_point": "Qualitative Parameters"},
    "150": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "RPA (Aggresive/Moderate/Conservative)", "touch_point": "Qualitative Parameters"},
    "151": {"value": ["Retirement planning", "Emergency fund", "Education planning", "Career break planning", "Car purchase", "Vacation planning", "Insurance planning", "Mutual fund portfolio review"], "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client discussed all these topics across both calls.", "agent": "QualitativeAgent", "attribute": "Areas of Interest (Custom tags - PF)", "touch_point": "Qualitative Parameters"},
    "152": {"value": ["Safety buffer preference", "Distrust of informal investment sources"], "confidence": 0.4, "confidence_level": "indirect", "source": "Client repeatedly asked to be 'on the safer side.'", "agent": "QualitativeAgent", "attribute": "Financial Biases (Custom tags)", "touch_point": "Qualitative Parameters"},
    "153": {"value": ["Explorer", "Long term investor"], "confidence": 0.4, "confidence_level": "indirect", "source": "Client described investing as 'more of just exploratory just trying something.'", "agent": "QualitativeAgent", "attribute": "Investing Style (Custom tags)", "touch_point": "Qualitative Parameters"},
    "154": {"value": ["Structure in financial planning", "Starting early", "Safety buffers", "Keeping career/education options open"], "confidence": 0.4, "confidence_level": "indirect", "source": "Client wanted 'some structure,' 'start early,' and asked to keep options open.", "agent": "QualitativeAgent", "attribute": "Likes", "touch_point": "Qualitative Parameters"},
    "155": {"value": ["Unstructured/random investing", "Overwhelming planning process", "Untrusted online/YouTube advice"], "confidence": 0.95, "confidence_level": "exact_quote", "source": "Client said planning was 'very overwhelming,' investments were 'very random.'", "agent": "QualitativeAgent", "attribute": "Dislikes", "touch_point": "Qualitative Parameters"},
    "156": {"value": "M", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client uses Google Pay, ClearTax, Gmail/Drive but needs help with financial tools.", "agent": "QualitativeAgent", "attribute": "Tech Saviness (H/M/L)", "touch_point": "Qualitative Parameters"},
    "157": {"value": "M", "confidence": 0.8, "confidence_level": "clearly_inferable", "source": "Client is proactive and shares documents but needs advisor guidance for execution.", "agent": "QualitativeAgent", "attribute": "Execution Capability (H/M/L)", "touch_point": "Qualitative Parameters"},
    "158": {"value": ["Proactive", "Cautious", "Reflective", "Detail-oriented"], "confidence": 0.4, "confidence_level": "indirect", "source": "Client reached out early, asked many clarifying questions, requested safer assumptions.", "agent": "QualitativeAgent", "attribute": "Behavioural Traits", "touch_point": "Qualitative Parameters"},
    "159": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "ITR Filing (Spouse, Parents etc.)", "touch_point": "Special Projects/VAS (opted)"},
    "160": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Rental TDS", "touch_point": "Special Projects/VAS (opted)"},
    "161": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "GST services", "touch_point": "Special Projects/VAS (opted)"},
    "162": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Remittance", "touch_point": "Special Projects/VAS (opted)"},
    "163": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Custom Services", "touch_point": "Special Projects/VAS (opted)"},
    "164": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advisor Name", "touch_point": "Advisor"},
    "165": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advisor Phone", "touch_point": "Advisor"},
    "166": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advisor Email id", "touch_point": "Advisor"},
    "167": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advisor's Qualification", "touch_point": "Advisor"},
    "168": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advisor's Experience", "touch_point": "Advisor"},
    "169": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Advance Tax", "touch_point": "Campaign (opted)"},
    "170": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "India Tax Filing status for FY", "touch_point": "Campaign (opted)"},
    "171": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "US Tax Filing status for Year", "touch_point": "Campaign (opted)"},
    "172": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "W8-BEN", "touch_point": "Campaign (opted)"},
    "173": {"value": "2026-04-25T21:42:54.359633", "confidence": 1.0, "confidence_level": "exact_quote", "source": "System", "agent": "SystemResolver", "attribute": "Last touchpoint date", "touch_point": "Engagement"},
    "174": {"value": None, "confidence": 0.0, "confidence_level": "not_extracted", "source": "", "agent": None, "attribute": "Last touchpoint agenda", "touch_point": "Engagement"},
}


def _seed_dummy_data() -> None:
    """Pre-seed one extraction and its parent meeting so the validation screen works out of the box."""
    meeting_id = "meeting-seed-001"
    extraction_id = "extraction-seed-001"

    _meetings[meeting_id] = MeetingRow(
        id=meeting_id,
        client_id="client_2",
        advisor_id="advisor_1",
        advisor_ids=["advisor_1"],
        advisor_names=["Anil Mehta"],
        scheduled_at="2026-04-25T10:00:00Z",
        duration_minutes=90,
        agenda="Initial Consultation — Financial Planning",
        title="Initial Consultation — Financial Planning",
        client_name="Priya Kapoor",
        advisor_name="Anil Mehta",
        member="Ops Team",
        created_by="system-seed",
        status="extraction_completed",
        firefly_meeting_id="firefly-seed-001",
        transcript_text="[Sample transcript — seeded data]",
        extraction_status="completed",
    )

    _extractions[extraction_id] = ExtractionRow(
        id=extraction_id,
        client_id="client_2",
        meeting_id=meeting_id,
        extraction_job_id="job-seed-001",
        provider="openai",
        model="gpt-5.4",
        extracted_at="2026-04-25T21:42:54",
        duration_seconds=93.87,
        total_fields=174,
        raw_data=_DUMMY_174_FIELDS,
    )

    _summaries["summary-seed-001"] = SummaryRow(
        id="summary-seed-001",
        meeting_id=meeting_id,
        client_id="client_2",
        executive_summary=(
            "Client is a 27-year-old salaried UX Designer at Alteryx, based in Bangalore. "
            "Key goals: retire at 45, emergency fund, car purchase in 2 years, education corpus, "
            "and career break in Q3 2026. Portfolio is fragmented across 21 mutual fund schemes "
            "and direct equities. Monthly income: ₹2.65L, expenses: ₹1.32L. No liabilities."
        ),
        key_points=[
            "Retirement / financial freedom goal: age 45",
            "Assets: ₹37.85L (bank, EPFO, equities, MF, gold)",
            "No liabilities — zero EMIs",
            "Monthly surplus: ~₹1.33L",
            "21 scattered mutual fund schemes — needs consolidation",
            "Only corporate health cover — no personal insurance",
        ],
        decisions_made=[
            "Advisor to prepare full financial plan in 3-4 days",
            "Client to upload CAS to shared Google Drive",
            "Client to verify employer group insurance details",
        ],
        client_sentiment="positive",
        advisor_notes="Client engaged and open to guidance. Good surplus for goals. Needs portfolio cleanup.",
        generated_by_model="gpt-5.4",
        generation_duration_seconds=12.5,
    )


# ── Stub reference data (replace with real proc lookups when DB is ready) ────

_STUB_CLIENTS = [
    {"id": "client_1", "name": "Rahul Sharma", "email": "siva@turtlefinance.in", "segment": "HNI"},
    {"id": "client_2", "name": "Priya Kapoor", "email": "siva@turtlefinance.in", "segment": "Mass Affluent"},
    {"id": "client_3", "name": "Amit Verma", "email": "siva@turtlefinance.in", "segment": "Ultra HNI"},
    {"id": "client_4", "name": "Sneha Patel", "email": "siva@turtlefinance.in", "segment": "HNI"},
    {"id": "client_5", "name": "Vikram Singh", "email": "siva@turtlefinance.in", "segment": "Mass Affluent"},
]

_STUB_ADVISORS = [
    {"id": "advisor_1", "name": "Anil Mehta", "email": "atharvabillore007@gmail.com", "specialization": "Financial Planning"},
    {"id": "advisor_2", "name": "Deepa Nair", "email": "atharvabillore007@gmail.com", "specialization": "Tax Advisory"},
    {"id": "advisor_3", "name": "Rohit Joshi", "email": "atharvabillore007@gmail.com", "specialization": "Estate Planning"},
    {"id": "advisor_4", "name": "Kavita Rao", "email": "atharvabillore007@gmail.com", "specialization": "Insurance"},
]


# ── Proc handlers ─────────────────────────────────────────────────────────────

def _resolve_client_name(client_id: str, provided: str | None) -> str:
    if provided:
        return provided
    match = next((c for c in _STUB_CLIENTS if c["id"] == client_id), None)
    return match["name"] if match else client_id


def _resolve_advisor_name(advisor_id: str, provided: str | None) -> str:
    if provided:
        return provided
    match = next((a for a in _STUB_ADVISORS if a["id"] == advisor_id), None)
    return match["name"] if match else advisor_id


async def _sp_schedule_meeting(
    client_id: str,
    advisor_id: str,
    scheduled_at: str,
    duration_minutes: int,
    agenda: str,
    created_by: str,
    title: str | None = None,
    client_name: str | None = None,
    advisor_name: str | None = None,
    # multi-advisor fields — TODO: map to DB proc columns when sp_schedule_meeting is ready
    advisor_ids: list | None = None,
    advisor_names: list | None = None,
    member: str | None = None,
    guests: list | None = None,
    notes: str | None = None,
    meeting_url: str | None = None,
) -> ProcResult:
    # TODO: replace body with real DB proc call when sp_schedule_meeting is ready
    # async with get_db_pool().acquire() as conn:
    #     row = await conn.fetchrow("CALL sp_schedule_meeting($1,$2,...)", ...)
    #     return ProcResult(result=row["meeting_id"], nextAction="create_firefly_meeting")
    meeting_id = str(uuid.uuid4())

    # Normalise multi-advisor lists — fall back to single advisor_id/name when not provided
    resolved_ids: list = advisor_ids if advisor_ids else [advisor_id]
    resolved_names: list = (
        advisor_names if advisor_names
        else [_resolve_advisor_name(advisor_id, advisor_name)]
    )
    # Ensure every ID has a resolved name (look up stubs for any that are missing)
    if len(resolved_names) < len(resolved_ids):
        resolved_names = [_resolve_advisor_name(aid, None) for aid in resolved_ids]

    display_advisor_name = " & ".join(resolved_names) if resolved_names else _resolve_advisor_name(advisor_id, advisor_name)

    _meetings[meeting_id] = MeetingRow(
        id=meeting_id,
        client_id=client_id,
        advisor_id=resolved_ids[0],
        advisor_ids=resolved_ids,
        advisor_names=resolved_names,
        scheduled_at=scheduled_at,
        duration_minutes=duration_minutes,
        agenda=agenda,
        status="scheduled",
        title=title or agenda,
        client_name=_resolve_client_name(client_id, client_name),
        advisor_name=display_advisor_name,
        member=member,
        guests=guests or [],
        notes=notes,
        meeting_url=meeting_url,
        created_by=created_by,
    )
    return ProcResult(result=meeting_id, nextAction="create_firefly_meeting")


async def _sp_update_meeting_firefly_id(
    meeting_id: str,
    firefly_meeting_id: str,
    firefly_meeting_url: str,
) -> ProcResult:
    meeting = _meetings.get(meeting_id)
    if not meeting:
        return ProcResult(errornumber=2001, errormessage="Meeting not found", nextAction="verify_meeting_id")
    meeting.firefly_meeting_id = firefly_meeting_id
    meeting.firefly_meeting_url = firefly_meeting_url
    return ProcResult(result=meeting_id, nextAction="publish_scheduled_event")


async def _sp_update_meeting_status(
    firefly_meeting_id: str,
    status: str,
    started_at: str | None = None,
    ended_at: str | None = None,
) -> ProcResult:
    meeting = next((m for m in _meetings.values() if m.firefly_meeting_id == firefly_meeting_id), None)
    if not meeting:
        return ProcResult(errornumber=2002, errormessage=f"Meeting not found for Firefly ID: {firefly_meeting_id}", nextAction="verify_firefly_id")
    meeting.status = status
    if started_at:
        meeting.started_at = started_at
    if ended_at:
        meeting.ended_at = ended_at
    next_action = {
        "completed": "fetch_transcript",
        "transcribed": "start_extraction",
        "cancelled": "send_cancellation_notification",
    }.get(status, "continue")
    return ProcResult(result=meeting.id, nextAction=next_action)


async def _sp_save_transcript(
    meeting_id: str,
    transcript_text: str,
    transcript_url: str,
    duration_seconds: int,
) -> ProcResult:
    meeting = _meetings.get(meeting_id)
    if not meeting:
        return ProcResult(errornumber=2003, errormessage="Meeting not found", nextAction="verify_meeting_id")
    meeting.transcript_text = transcript_text
    meeting.transcript_url = transcript_url
    meeting.transcript_duration_seconds = duration_seconds
    meeting.status = "transcribed"
    meeting.extraction_status = "pending"
    return ProcResult(result=meeting_id, nextAction="publish_transcribed_event")


async def _fn_get_meeting_for_extraction(meeting_id: str) -> ProcResult:
    meeting = _meetings.get(meeting_id)
    if not meeting:
        return ProcResult(errornumber=2001, errormessage="Meeting not found")
    agenda_lower = meeting.agenda.lower()
    if "initial" in agenda_lower:
        meeting_type = "initial_consultation"
    elif "review" in agenda_lower:
        meeting_type = "financial_review"
    elif "goal" in agenda_lower:
        meeting_type = "goal_planning"
    else:
        meeting_type = "initial_consultation"

    agent_map = {
        "initial_consultation": ["DemographicsAgent", "FinanceAgent", "GoalsAgent", "ProfessionalAgent", "QualitativeAgent", "SystemResolver"],
        "financial_review": ["FinanceAgent", "GoalsAgent", "TaskAgent", "FeedbackAgent", "SystemResolver"],
        "goal_planning": ["GoalsAgent", "FinanceAgent", "ScheduleAgent", "TaskAgent", "SystemResolver"],
    }
    return ProcResult(result={
        "client_id": meeting.client_id,
        "agenda": meeting.agenda,
        "scheduled_at": meeting.scheduled_at,
        "agents_to_use": agent_map[meeting_type],
    })


async def _sp_save_extraction(
    client_id: str,
    meeting_id: str,
    extraction_job_id: str,
    provider: str,
    model: str,
    extracted_at: str,
    duration_seconds: float,
    total_fields: int,
    raw_data: dict,
) -> ProcResult:
    if any(e.extraction_job_id == extraction_job_id for e in _extractions.values()):
        return ProcResult(errornumber=3001, errormessage="Extraction job ID already exists", nextAction="check_duplicate")
    extraction_id = str(uuid.uuid4())
    _extractions[extraction_id] = ExtractionRow(
        id=extraction_id,
        client_id=client_id,
        meeting_id=meeting_id,
        extraction_job_id=extraction_job_id,
        provider=provider,
        model=model,
        extracted_at=extracted_at,
        duration_seconds=duration_seconds,
        total_fields=total_fields,
        raw_data=raw_data,
    )
    meeting = _meetings.get(meeting_id)
    if meeting:
        meeting.status = "extraction_completed"
        meeting.extraction_status = "completed"
        meeting.extraction_job_id = extraction_job_id
    return ProcResult(result=extraction_id, nextAction="process_by_domain")


async def _sp_save_demographics(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _demographics[client_id] = {"extraction_id": extraction_id, "data": data}
    return ProcResult(result=client_id, nextAction="save_contacts")


async def _sp_save_financials(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _financials[client_id] = {"extraction_id": extraction_id, "data": data}
    return ProcResult(result=client_id, nextAction="save_goals")


async def _sp_save_goals(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _goals.append({"client_id": client_id, "extraction_id": extraction_id, "data": data})
    return ProcResult(result=client_id, nextAction="save_qualitative")


async def _sp_save_qualitative(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _qualitative[client_id] = {"extraction_id": extraction_id, "data": data}
    return ProcResult(result=client_id, nextAction="publish_data_saved_event")


async def _sp_save_summary(
    meeting_id: str,
    client_id: str,
    executive_summary: str,
    key_points: list,
    decisions_made: list,
    client_sentiment: str | None,
    advisor_notes: str | None,
    model: str,
    duration_seconds: float,
) -> ProcResult:
    if any(s.meeting_id == meeting_id for s in _summaries.values()):
        return ProcResult(errornumber=4001, errormessage="Summary already exists for this meeting", nextAction="update_or_skip")
    summary_id = str(uuid.uuid4())
    _summaries[summary_id] = SummaryRow(
        id=summary_id,
        meeting_id=meeting_id,
        client_id=client_id,
        executive_summary=executive_summary,
        key_points=key_points,
        decisions_made=decisions_made,
        client_sentiment=client_sentiment,
        advisor_notes=advisor_notes,
        generated_by_model=model,
        generation_duration_seconds=duration_seconds,
    )
    return ProcResult(result=summary_id, nextAction="save_action_items")


async def _sp_save_action_item(
    meeting_id: str,
    client_id: str,
    action_type: str,
    description: str,
    assigned_to: str | None,
    due_date: str | None,
    priority: str,
    confidence: float | None,
) -> ProcResult:
    action_id = str(uuid.uuid4())
    _action_items.append(ActionItemRow(
        id=action_id,
        meeting_id=meeting_id,
        client_id=client_id,
        action_type=action_type,
        description=description,
        assigned_to=assigned_to,
        due_date=due_date,
        priority=priority,
        confidence=confidence,
    ))
    return ProcResult(result=action_id, nextAction="continue_or_finish")


async def _sp_cancel_meeting(
    meeting_id: str,
    cancelled_by: str,
    cancellation_reason: str,
) -> ProcResult:
    meeting = _meetings.get(meeting_id)
    if not meeting:
        return ProcResult(errornumber=2004, errormessage="Meeting not found", nextAction="verify_meeting_id")
    if meeting.status in ("completed", "transcribed", "extraction_completed"):
        return ProcResult(errornumber=2005, errormessage="Cannot cancel completed meeting", nextAction="contact_admin")
    meeting.status = "cancelled"
    return ProcResult(result=meeting_id, nextAction="cancel_in_firefly")


async def _fn_get_extraction(extraction_id: str) -> ProcResult:
    extraction = _extractions.get(extraction_id)
    if not extraction:
        return ProcResult(errornumber=3002, errormessage="Extraction not found")
    return ProcResult(result=extraction)


async def _fn_list_meetings() -> ProcResult:
    # TODO: uncomment when sp_list_meetings proc is ready
    # async with get_db_pool().acquire() as conn:
    #     rows = await conn.fetch("CALL sp_list_meetings()")
    #     return ProcResult(result=[dict(r) for r in rows])
    results = [
        {
            "id": m.id,
            "title": m.title or m.agenda,
            "agenda": m.agenda,
            "client_id": m.client_id,
            "client_name": _resolve_client_name(m.client_id, m.client_name),
            "advisor_id": m.advisor_id,
            "advisor_name": m.advisor_name or _resolve_advisor_name(m.advisor_id, None),
            "advisor_ids": m.advisor_ids or [m.advisor_id],
            "advisor_names": m.advisor_names or [_resolve_advisor_name(m.advisor_id, None)],
            "member": m.member or m.created_by or "—",
            "guests": m.guests or [],
            "notes": m.notes or "",
            "scheduled_at": m.scheduled_at,
            "duration_minutes": m.duration_minutes,
            "status": m.status,
            "meeting_url": m.meeting_url or m.firefly_meeting_url or "",
            "firefly_meeting_id": m.firefly_meeting_id or "",
            "extraction_status": m.extraction_status or "",
            "created_by": m.created_by or "",
            "created_at": m.created_at,
        }
        for m in _meetings.values()
    ]
    results.sort(key=lambda m: m["scheduled_at"], reverse=True)
    return ProcResult(result=results)


async def _fn_list_clients() -> ProcResult:
    # TODO: uncomment when sp_list_clients proc is ready
    # async with get_db_pool().acquire() as conn:
    #     rows = await conn.fetch("CALL sp_list_clients()")
    #     return ProcResult(result=[dict(r) for r in rows])
    return ProcResult(result=_STUB_CLIENTS)


async def _fn_list_advisors() -> ProcResult:
    # TODO: uncomment when sp_list_advisors proc is ready
    # async with get_db_pool().acquire() as conn:
    #     rows = await conn.fetch("CALL sp_list_advisors()")
    #     return ProcResult(result=[dict(r) for r in rows])
    return ProcResult(result=_STUB_ADVISORS)


async def _fn_list_extractions(validated: bool | None = None) -> ProcResult:
    results = list(_extractions.values())
    if validated is not None:
        results = [e for e in results if e.validated == validated]
    return ProcResult(result=results)


def hydrate_extractions_from_disk(extractions_dir: str = "/app/transcripts/extractions") -> int:
    """
    Load every saved extraction JSON into the in-memory _extractions store so the
    /api/extractions endpoints survive container restarts without a DB.
    Returns the number of extractions loaded.
    """
    import json as _json
    from pathlib import Path as _Path

    root = _Path(extractions_dir)
    if not root.exists():
        return 0

    loaded = 0
    for path in root.glob("*.json"):
        try:
            data = _json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        extraction_id = data.get("extraction_id")
        if not extraction_id or extraction_id in _extractions:
            continue
        fields = data.get("fields", {})
        _extractions[extraction_id] = ExtractionRow(
            id=extraction_id,
            client_id=data.get("client_id", ""),
            meeting_id=data.get("meeting_id", ""),
            extraction_job_id=data.get("extraction_job_id", f"job-{extraction_id}"),
            provider="crm-ai",
            model=data.get("model", "unknown"),
            extracted_at=data.get("extracted_at", ""),
            duration_seconds=data.get("duration_seconds", 0.0),
            total_fields=len(fields),
            raw_data=fields,
        )
        # Stub the parent meeting row so /api/extractions/{id} responses are complete.
        meeting_id = data.get("meeting_id", "")
        if meeting_id and meeting_id not in _meetings:
            _meetings[meeting_id] = MeetingRow(
                id=meeting_id,
                client_id=data.get("client_id", ""),
                advisor_id="",
                scheduled_at=data.get("extracted_at", ""),
                duration_minutes=int(data.get("duration_seconds") or 0) // 60,
                agenda=data.get("agenda", ""),
                title=data.get("agenda", ""),
                status="extraction_completed",
                extraction_status="completed",
                firefly_meeting_id=data.get("firefly_meeting_id", ""),
                meeting_url=data.get("meet_url", ""),
            )
        loaded += 1
    return loaded


async def _sp_validate_extraction(
    extraction_id: str,
    validated_by: str,
    validation_notes: str | None,
    changes: list[dict],
) -> ProcResult:
    extraction = _extractions.get(extraction_id)
    if not extraction:
        return ProcResult(errornumber=3002, errormessage="Extraction not found")
    # Apply field value changes
    for change in changes:
        field_id = str(change.get("field_id"))
        if field_id in extraction.raw_data:
            extraction.raw_data[field_id]["value"] = change.get("new_value")
    extraction.validated = True
    extraction.validated_by = validated_by
    extraction.validated_at = datetime.now(timezone.utc).isoformat()
    extraction.validation_notes = validation_notes
    return ProcResult(result=extraction_id, nextAction="publish_validated_event")


# ── Registration ──────────────────────────────────────────────────────────────

def register_meeting_procs() -> None:
    register_proc("fn_list_meetings", _fn_list_meetings)
    register_proc("fn_list_clients", _fn_list_clients)
    register_proc("fn_list_advisors", _fn_list_advisors)
    register_proc("sp_schedule_meeting", _sp_schedule_meeting)
    register_proc("sp_update_meeting_firefly_id", _sp_update_meeting_firefly_id)
    register_proc("sp_update_meeting_status", _sp_update_meeting_status)
    register_proc("sp_save_transcript", _sp_save_transcript)
    register_proc("fn_get_meeting_for_extraction", _fn_get_meeting_for_extraction)
    register_proc("sp_save_extraction", _sp_save_extraction)
    register_proc("sp_save_demographics", _sp_save_demographics)
    register_proc("sp_save_financials", _sp_save_financials)
    register_proc("sp_save_goals", _sp_save_goals)
    register_proc("sp_save_qualitative", _sp_save_qualitative)
    register_proc("sp_save_summary", _sp_save_summary)
    register_proc("sp_save_action_item", _sp_save_action_item)
    register_proc("sp_cancel_meeting", _sp_cancel_meeting)
    register_proc("fn_get_extraction", _fn_get_extraction)
    register_proc("fn_list_extractions", _fn_list_extractions)
    register_proc("sp_validate_extraction", _sp_validate_extraction)
    # NOTE: seed data disabled — API now returns only real extractions
    # (hydrated from disk on startup, plus anything added live).


# ── Public wrappers ───────────────────────────────────────────────────────────

async def proc_list_meetings() -> list[dict]:
    res = await call_proc("fn_list_meetings")
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_list_clients() -> list[dict]:
    res = await call_proc("fn_list_clients")
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_list_advisors() -> list[dict]:
    res = await call_proc("fn_list_advisors")
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_schedule_meeting(**kwargs) -> MeetingRow:
    res = await call_proc("sp_schedule_meeting", **kwargs)
    if not res.ok:
        raise ValueError(res.errormessage) if res.errornumber in (1001, 1002, 1003, 1004) else RuntimeError(res.errormessage)
    return res.result


async def proc_update_meeting_firefly_id(**kwargs):
    res = await call_proc("sp_update_meeting_firefly_id", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_update_meeting_status(**kwargs) -> str:
    res = await call_proc("sp_update_meeting_status", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_save_transcript(**kwargs):
    res = await call_proc("sp_save_transcript", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_get_meeting_for_extraction(meeting_id: str) -> dict:
    res = await call_proc("fn_get_meeting_for_extraction", meeting_id)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_save_extraction(**kwargs) -> str:
    res = await call_proc("sp_save_extraction", **kwargs)
    if not res.ok:
        if res.errornumber == 3001:
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_save_demographics(**kwargs):
    res = await call_proc("sp_save_demographics", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_financials(**kwargs):
    res = await call_proc("sp_save_financials", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_goals(**kwargs):
    res = await call_proc("sp_save_goals", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_qualitative(**kwargs):
    res = await call_proc("sp_save_qualitative", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_summary(**kwargs) -> str:
    res = await call_proc("sp_save_summary", **kwargs)
    if not res.ok:
        if res.errornumber == 4001:
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_save_action_item(**kwargs) -> str:
    res = await call_proc("sp_save_action_item", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_cancel_meeting(**kwargs):
    res = await call_proc("sp_cancel_meeting", **kwargs)
    if not res.ok:
        raise ValueError(res.errormessage) if res.errornumber in (2004, 2005) else RuntimeError(res.errormessage)


async def proc_get_extraction(extraction_id: str) -> ExtractionRow:
    res = await call_proc("fn_get_extraction", extraction_id)
    if not res.ok:
        raise ValueError(res.errormessage)
    return res.result


async def proc_list_extractions(validated: bool | None = None) -> list[ExtractionRow]:
    res = await call_proc("fn_list_extractions", validated)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_validate_extraction(**kwargs):
    res = await call_proc("sp_validate_extraction", **kwargs)
    if not res.ok:
        raise ValueError(res.errormessage)
