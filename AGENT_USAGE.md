# AI Agent Usage

## AI Tools Used

AI coding assistants including ChatGPT and Claude were used during the development of this project.

They were used for:

- Understanding the assessment requirements
- Designing the application architecture
- Generating implementation ideas
- Debugging JavaScript and Node.js issues
- Debugging React and Vite configuration
- Designing the AI workflow
- Improving validation and error handling
- Writing and reviewing documentation
- Reviewing deployment configuration
- Creating focused test cases

All AI-generated suggestions were reviewed and tested before being included in the final application.

## Representative Prompts

### Application Architecture

> Design a full-stack equipment maintenance triage application with a React frontend, Node.js backend, deterministic safety rules, knowledge-base retrieval, AI-generated possible causes, and human technician approval.

### AI Workflow

> Design an AI workflow that generates possible maintenance causes, follow-up questions, inspection steps, priority and a draft work order while requiring citations for AI suggestions.

### Backend Debugging

> Explain this Node.js module import error and identify why the backend cannot find the AI module.

### Frontend Debugging

> Review the React/Vite project structure and identify why the frontend entry point or configuration is not working.

### Testing

> Create focused tests for deterministic equipment maintenance rules including missing sensors, conflicting readings and threshold violations.

### Documentation

> Review the project against the assessment requirements and identify missing documentation, testing and deployment information.

## Work Delegated to AI

AI assistance was used to accelerate:

- Initial project structure
- Backend implementation ideas
- Frontend implementation ideas
- Gemini API integration
- Structured AI output validation
- Citation validation
- Error handling
- Test-case design
- README documentation
- Debugging configuration issues
- Deployment configuration review

The final application behaviour and safety boundaries were reviewed manually.

## Important AI Mistakes and Corrections

### 1. Incorrect Frontend Project Structure

The initial project structure placed the `src` directory outside the `frontend` directory.

It was corrected so that the frontend follows:

```text
frontend/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── index.html
├── package.json
└── vite.config.js