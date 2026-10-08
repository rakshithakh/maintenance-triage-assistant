# Equipment Maintenance Triage Assistant

An AI-assisted equipment maintenance triage application that helps technicians analyze reported equipment issues, identify possible causes, retrieve relevant maintenance guidance, suggest inspection steps, assign a priority, and create a draft work order.

The system combines deterministic engineering rules with retrieval and an AI workflow. AI suggestions are always presented as possible causes/recommendations and require human technician review before a work order can be approved.

## Live Application

Frontend:
https://maintenance-triage-assistant.vercel.app/

Backend:
https://maintenance-triage-assistant.onrender.com/

## Problem Selected

Problem 1 — Equipment Maintenance Triage Assistant

## Features

- Equipment issue reporting
- Deterministic threshold and sensor checks
- Detection of missing and conflicting sensor readings
- Retrieval of relevant maintenance manual sections
- AI-generated possible causes
- AI-generated follow-up questions
- Suggested inspection steps
- Priority recommendation
- Draft work-order generation
- Citation-backed AI suggestions
- Human technician review
- Technician confirmation of findings
- Work-order approval and rejection
- JSON-based persistence
- Audit/activity logging
- Error, loading and validation states

## Architecture

The application consists of a React frontend and a Node.js/Express backend.

```text
User
  |
  v
React Frontend
  |
  v
Node.js / Express API
  |
  +--> Deterministic Rules
  |
  +--> Knowledge Base Retrieval
  |
  +--> Gemini AI
  |
  +--> Validation + Citation Checks
  |
  +--> JSON Persistence
  |
  v
Technician Review
  |
  +--> Confirm Findings
  +--> Edit Work Order
  +--> Approve / Reject