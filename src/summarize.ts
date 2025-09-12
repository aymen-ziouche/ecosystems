import * as fs from "fs";
import * as path from "path";

const INPUT_FILE_PATH = path.join(__dirname, '..', 'data', 'exports_commit_history.json');
const DAILY_OUTPUT_PATH = path.join(__dirname, '..', 'public', 'daily_summary.json');
const ECO_OUTPUT_PATH = path.join(__dirname, '..', 'public', 'ecosystem_summary.json');

function summarizeData() {
    console.log("📈 Starting data summarization...");

    if (!fs.existsSync(INPUT_FILE_PATH)) {
        console.error("❌ ERROR: The main data file 'exports_commit_history.json' does not exist. Run 'npm start' first.");
        return;
    }

    const fileContent = fs.readFileSync(INPUT_FILE_PATH, 'utf-8');
    const jsonData = JSON.parse(fileContent);

    // --- 1. Aggregate data for the timeline chart ---
    const commitsByDay: { [date: string]: number } = {};
    jsonData.forEach((repoData: { commits: any[]; }) => {
        repoData.commits.forEach((commit: { date: string | number | Date; }) => {
            if (commit.date) {
                const date = new Date(commit.date).toISOString().split('T')[0];
                if (!commitsByDay[date]) commitsByDay[date] = 0;
                commitsByDay[date]++;
            }
        });
    });

    // --- 2. Aggregate data for the ecosystem breakdown ---
    const commitsByEcosystem: { [ecosystem: string]: number } = {};
    let totalCommits = 0;
    jsonData.forEach((repoData: { ecosystem: any; commits: string | any[]; }) => {
        const ecosystem = repoData.ecosystem;
        const commitCount = repoData.commits.length;
        if (!commitsByEcosystem[ecosystem]) commitsByEcosystem[ecosystem] = 0;
        commitsByEcosystem[ecosystem] += commitCount;
        totalCommits += commitCount;
    });

    // --- 3. Save the small summary files ---
    fs.writeFileSync(DAILY_OUTPUT_PATH, JSON.stringify(commitsByDay, null, 2));
    console.log(`✅ Daily summary saved to ${DAILY_OUTPUT_PATH}`);
    
    fs.writeFileSync(ECO_OUTPUT_PATH, JSON.stringify({ totals: commitsByEcosystem, overallTotal: totalCommits }, null, 2));
    console.log(`✅ Ecosystem summary saved to ${ECO_OUTPUT_PATH}`);
    
    console.log("🎉 Summarization complete!");
}

summarizeData();
