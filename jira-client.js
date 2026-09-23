import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import { marked } from 'marked';

// 1. Initialize the Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateWeeklyReport() {
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const domain = process.env.JIRA_URL; 

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  
  // Scoped exactly to your active project board
  const rawJql = 'project = "PASSP" AND sprint in openSprints()';
  const jql = encodeURIComponent(rawJql);
  const url = `${domain}/rest/api/3/search/jql?jql=${jql}&maxResults=50`;

  try {
    console.log("Fetching active sprint data from Jira...");
    
    // 2. Fetch the Jira Data
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Jira HTTP error! status: ${response.status}`);
    }

    const jiraData = await response.json();
    console.log(`Successfully fetched ${jiraData.issues?.length || 0} active issues. Analyzing...`);

    // 3. Define the AI System Prompt with strict product guardrails
    const systemInstruction = `You are an expert AI Product Operations Agent supporting the Chief Product Officer. Your core function is to evaluate active engineering execution against weekly strategic business goals for PaSeva, Mannkaa, and Mat of Life.

    Your task is to analyze the provided active sprint data (JSON from Jira). Categorize every ticket into one of three buckets:
    - Direct Alignment: Explicitly advances core product goals.
    - Maintenance/Tech Debt: Necessary operational work.
    - Scope Creep: Consuming resources but actively misaligned with current product definitions.

    CRITICAL PRODUCT DEFINITIONS TO ENFORCE:
    - Mat of Life is an elderly fall-risk detection floor sensor system. Flag any tickets treating it as an infrared wellness mat as Scope Creep.
    - The PaSeva caregiver mapping interface is strictly for weekly efficiency audits (active patients are already assigned). Flag any tickets treating it as an initial patient assignment tool as Scope Creep.

    OUTPUT REQUIREMENTS:
    Generate two distinct reports formatted in Markdown:
    1. EXECUTIVE SYNC (For CEO Dr. Dev Brar): Focus on strategic OKR progress, weekly goals on track vs at risk, and the percentage of engineering effort mapped to business objectives.
    2. TACTICAL SYNC (For EM Neeraj): Focus on execution velocity across the 3-week sprint, stalled tickets, and explicitly call out Scope Creep tasks draining resources.`;

    // Update these goals weekly before the script runs, or point this to a dynamic document later
    const weeklyGoals = `
    CURRENT WEEKLY GOALS:
    1. Finalize PaSeva automated referral intake workflows.
    2. Establish operational guidelines for hardware testing of Mat of Life.
    `;

    const prompt = `
    ${weeklyGoals}
    
    JIRA SPRINT DATA (JSON):
    ${JSON.stringify(jiraData, null, 2)}
    `;

    // 4. Execute the Gemini Evaluation with Exponential Backoff
    let retries = 5; // Increased to 5 attempts
    let delay = 10000; // Start with a 10-second wait for severe spikes
    let result;

    while (retries > 0) {
      try {
        result = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
          }
        });
        
        break; // Success! Exit the retry loop.
        
      } catch (error) {
        if (error.status === 503 && retries > 1) {
          console.log(`\nGoogle AI is busy. Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; 
          retries--;
        } else {
          console.error("\nAPI Error exhausted retries or encountered a fatal error:", error);
          break; 
        }
      }
    }

    // 5. Safely parse and email ONLY if the API succeeded
if (result && result.text) {
  console.log("\n================ REPORT GENERATED ================\n");
  const htmlReport = marked.parse(result.text);
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const data = await resend.emails.send({
      from: 'onboarding@resend.dev', // Must use this exact testing address
      to: process.env.OUTLOOK_EMAIL, // Must match your Resend sign-up email
      subject: 'Daily Sync Report: Jira & Strategy Alignment',
      html: htmlReport
    });
    
    console.log("Report successfully generated and emailed via Resend!", data);
  } catch (error) {
    console.error("Failed to send email via Resend:", error);
    process.exit(1); 
  }
} else {
  console.error("\nFailed to generate the report. No email was sent.");
  process.exit(1);
}
} catch (error) {
console.error("Error executing agentic workflow:", error);
process.exit(1);
}
}

generateWeeklyReport();