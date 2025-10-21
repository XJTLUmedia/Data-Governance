/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';
import { marked } from 'https://esm.sh/marked@13.0.0';
import Papa from 'papaparse';


const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  document.body.innerHTML = '<div class="error">Missing API Key!</div>';
  throw new Error('Missing API Key');
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = 'gemini-2.5-pro';

// --- DOM Elements ---
const tabCompliance = document.getElementById('tab-compliance') as HTMLButtonElement;
const tabClassifier = document.getElementById('tab-classifier') as HTMLButtonElement;
const contentCompliance = document.getElementById('content-compliance') as HTMLDivElement;
const contentClassifier = document.getElementById('content-classifier') as HTMLDivElement;

const schemaInputCompliance = document.getElementById('schema-input-compliance') as HTMLTextAreaElement;
const queryInput = document.getElementById('query-input') as HTMLTextAreaElement;
const checkComplianceBtn = document.getElementById('check-compliance-btn') as HTMLButtonElement;
const complianceResult = document.getElementById('compliance-result') as HTMLDivElement;

const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const schemaInputClassifier = document.getElementById('schema-input-classifier') as HTMLTextAreaElement;
const sampleInput = document.getElementById('sample-input') as HTMLTextAreaElement;
const classifyDataBtn = document.getElementById('classify-data-btn') as HTMLButtonElement;
const classifierResult = document.getElementById('classifier-result') as HTMLDivElement;

// --- Tab Navigation ---
function switchTab(activeTab: HTMLButtonElement, activeContent: HTMLDivElement) {
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  activeTab.classList.add('active');
  activeTab.setAttribute('aria-selected', 'true');
  activeContent.classList.add('active');
}

tabCompliance.addEventListener('click', () => switchTab(tabCompliance, contentCompliance));
tabClassifier.addEventListener('click', () => switchTab(tabClassifier, contentClassifier));

// --- API Logic ---

/**
 * A helper function to stream responses from the Gemini API.
 */
async function streamResponse(
  prompt: string,
  resultElement: HTMLElement,
  buttonElement: HTMLButtonElement
) {
  buttonElement.disabled = true;
  resultElement.innerHTML = '<div class="loading"></div>';

  try {
    const responseStream = await ai.models.generateContentStream({
      model,
      contents: prompt,
    });

    let fullResponse = '';
    resultElement.innerHTML = '';
    for await (const chunk of responseStream) {
      fullResponse += chunk.text;
      resultElement.innerHTML = marked.parse(fullResponse) as string;
    }
  } catch (error) {
    console.error(error);
    resultElement.innerHTML = `<div class="error">An error occurred: ${error.message}</div>`;
  } finally {
    buttonElement.disabled = false;
  }
}

// --- Query Compliance Checker ---
checkComplianceBtn.addEventListener('click', () => {
  const schema = schemaInputCompliance.value;
  const query = queryInput.value;

  if (!schema.trim() || !query.trim()) {
    complianceResult.innerHTML = '<div class="error">Schema and Query cannot be empty.</div>';
    return;
  }

  const prompt = `
    You are a Data Governance Expert.
    Your task is to analyze a user's query against a given data schema, determine its compliance, and if it is compliant, show a sample of the query's result with all PII redacted.

    **Data Schema:**
    \`\`\`json
    ${schema}
    \`\`\`

    **User Query:**
    \`\`\`sql
    ${query}
    \`\`\`

    Please provide the following analysis in well-structured Markdown format:

    ---

    ### Compliance Analysis

    **Compliance Status:** (State "Compliant" or "Non-Compliant")

    **Reasoning:** (If Non-Compliant, explain the violation. If Compliant, briefly state why.)

    **Suggested Compliant Query:** (If Non-Compliant, provide a safe alternative. If Compliant, state that no changes are needed.)

    ---

    ### Sample Redacted Results

    -   If the query is **Compliant**, generate a small, realistic, sample markdown table representing the query's output (3-4 rows).
    -   In this table, for any column identified as PII from the schema, replace its data with the placeholder \`[REDACTED]\`.
    -   If the query is **Non-Compliant**, simply state: "Redacted results are not generated for non-compliant queries."
  `;

  streamResponse(prompt, complianceResult, checkComplianceBtn);
});


// --- Data Classifier ---

// File Upload Handler
fileUpload.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }

  Papa.parse(file, {
    header: true,
    preview: 5, // Process only the first 5 data rows for the sample
    complete: (results) => {
      const headers = results.meta.fields?.join(', ');
      // Create a JSON schema representation for better analysis
      const schemaForPrompt = JSON.stringify({
        name: file.name,
        fields: results.meta.fields?.map(f => ({ name: f, type: 'unknown' }))
      }, null, 2);

      const sampleData = Papa.unparse(results.data);

      schemaInputClassifier.value = schemaForPrompt;
      sampleInput.value = sampleData;
    },
    error: (error) => {
      classifierResult.innerHTML = `<div class="error">Error parsing file: ${error.message}</div>`;
    }
  });
});


classifyDataBtn.addEventListener('click', () => {
  const schema = schemaInputClassifier.value;
  const sample = sampleInput.value;

  if (!schema.trim() || !sample.trim()) {
    classifierResult.innerHTML = '<div class="error">Schema and Data Sample cannot be empty.</div>';
    return;
  }

  const prompt = `
    You are a Data Classification Specialist.
    Your task is to analyze a data schema and a corresponding data sample to classify each field's sensitivity level. The data may be in JSON or CSV format.

    **Data Schema:**
    \`\`\`
    ${schema}
    \`\`\`

    **Data Sample:**
    \`\`\`
    ${sample}
    \`\`\`

    Please perform the following:
    1.  Carefully examine each field provided in the schema.
    2.  Use the data sample to understand the context and typical values for each field.
    3.  Classify each field into one of the following categories:
        -   **PII (Personally Identifiable Information):** Data that can be used to identify a specific individual (e.g., name, email, address, phone number, IP address).
        -   **Sensitive:** Data that is confidential but not directly identifying (e.g., financial data, internal metrics, transaction amounts).
        -   **Public:** Non-sensitive data that can be shared openly (e.g., product IDs, transaction dates, public identifiers).

    Present your findings in a clear Markdown table with the following columns:
    -   **Field Name**
    -   **Classification**
    -   **Reasoning** (Provide a brief justification for your classification).
  `;
  streamResponse(prompt, classifierResult, classifyDataBtn);
});