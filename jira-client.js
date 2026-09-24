import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import { marked } from 'marked';
import { Resend } from 'resend';
import fetch from 'node-fetch';

// Initialize Vertex AI client using environment variables for GCP credit routing
const ai = new GoogleGenAI();

// Initialize Resend for emailing reports
const resend = new Resend(process.env.RESEND_API_KEY);

async function fetchJiraIssues() {
  const jiraUrl = process.env.JIRA_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraApiToken = process.env.JIRA_API_TOKEN;

  if (!jiraUrl || !jiraEmail || !jiraApiToken) {
    throw new Error("Missing Jira credentials in environment variables.");
  }

  const authHeader = 'Basic ' + Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
  
  // Scoped JQL query targeting your project with full field support including links and comments
  const fieldsParam = 'summary,description,status,issuetype,labels,issuelinks,comment';
  const jqlQuery = encodeURIComponent('project = STRAT ORDER BY created DESC');
  const endpoint = `${jiraUrl}/rest/api/3/search/jql?jql=${jqlQuery}&maxResults=25&fields=${fieldsParam}`;

  console.log("Fetching dynamic sprint data, linked blockers, and comments from Jira...");
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Jira API Error (${response.status} ${response.statusText}): ${errorBody}`);
  }

  const data = await response.json();
  return data.issues || [];
}

async function generateWeeklyReport() {
  const issues = await fetchJiraIssues();
  console.log(`Successfully fetched ${issues.length} issues with complete metadata.`);

  const prompt = `Analyze these Jira issues, including their linked items (blockers/dependencies) and recent comments:\n${JSON.stringify(issues, null, 2)}`;

  const systemInstruction = `
You are an expert executive product manager AI agent analyzing Jira sprint issues.
For every issue, carefully inspect:
1. **Linked Issues (issuelinks)**: Identify if the issue is blocked by another ticket, blocks something else, or has dependencies. Determine if those linked items are inside the current sprint or outside it (which represents a cross-team dependency/blocker risk).
2. **Comments (comment)**: Scan recent comments for discussions about blockers, unpredicted delays, or scope adjustments.
3. **Product Alignment**: Enforce alignment with project goals.
Provide a clear breakdown of active sprint blockers, external dependencies, and risk assessments in clean Markdown format.
  `;

  console.log("Generating report with Gemini via Vertex AI (gemini-2.5-flash)...");
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
    }
  });

  const reportMarkdown = result.text;
  console.log("Report generated successfully!");
  return reportMarkdown;
}

async function sendEmailReport(reportMarkdown) {
  const outlookEmail = process.env.OUTLOOK_EMAIL;
  if (!outlookEmail) {
    console.warn("OUTLOOK_EMAIL not set. Skipping email delivery.");
    return;
  }

  // Convert markdown to HTML for email delivery via Resend
  const htmlContent = marked.parse(reportMarkdown);

  console.log(`Sending daily report email to ${outlookEmail}...`);
  const data = await resend.emails.send({
    from: 'Jira Agent Tracker <onboarding@resend.dev>',
    to: [outlookEmail],
    subject: 'Daily Agentic Jira Tracker Report - Blockers & Sprint Analysis',
    html: htmlContent,
  });

  console.log("Email sent successfully:", data);
}

async function main() {
  try {
    const report = await generateWeeklyReport();
    await sendEmailReport(report);
  } catch (error) {
    console.error("API Error exhausted retries or encountered a fatal error:", error);
    process.exit(1);
  }
}

main();