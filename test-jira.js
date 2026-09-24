import 'dotenv/config';
import fetch from 'node-fetch';

async function testJiraFetch() {
  const jiraUrl = process.env.JIRA_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraApiToken = process.env.JIRA_API_TOKEN;

  if (!jiraUrl || !jiraEmail || !jiraApiToken) {
    console.error("❌ Missing Jira credentials in your .env file!");
    return;
  }

  // Basic Auth encoding for Jira REST API
  const authHeader = 'Basic ' + Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
  
  // Scoped JQL query restricting to your project with full metadata fields
  const jqlQuery = encodeURIComponent('project = STRAT ORDER BY created DESC');
  const fieldsParam = 'summary,description,status,issuetype,labels,issuelinks,comment';
  const endpoint = `${jiraUrl}/rest/api/3/search/jql?jql=${jqlQuery}&maxResults=5&fields=${fieldsParam}`;

  console.log(`🔍 Connecting to Jira search JQL endpoint...`);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Jira API Error: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error(errorBody);
      return;
    }

    const data = await response.json();
    console.log(`\n✅ Successfully connected! Found ${data.issues?.length || 0} issues.\n`);

    if (data.issues && data.issues.length > 0) {
      const sample = data.issues[0];
      console.log("--- Sample Issue Detailed Structure ---");
      console.log(`Key: ${sample.key}`);
      console.log(`Summary: ${sample.fields?.summary}`);
      console.log(`Status: ${sample.fields?.status?.name}`);
      console.log(`Linked Issues Count: ${sample.fields?.issuelinks?.length || 0}`);
      console.log(`Comments Count: ${sample.fields?.comment?.comments?.length || 0}`);
      
      if (sample.fields?.issuelinks?.length > 0) {
        console.log("🔗 Sample Link Example:", JSON.stringify(sample.fields.issuelinks[0], null, 2));
      }

      console.log("\n🎉 Success! All fields, links, and comments are accessible.");
    } else {
      console.log("⚠️ No issues returned for this project query.");
    }

  } catch (err) {
    console.error("❌ Network or execution error:", err);
  }
}

testJiraFetch();