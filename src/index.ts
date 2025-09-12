import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import "dotenv/config";

// --- CONFIGURATION ---
const INPUT_FILE_PATH = path.join(__dirname, '..', 'data', 'exports.json');
const OUTPUT_FILE_PATH = path.join(__dirname, '..', 'data', 'exports_commit_history.json');
const DAYS_AGO = 30;
const GITHUB_TOKENS_STRING = process.env.GITHUB_TOKENS;

// --- MAIN EXECUTION ---

const ThrottledOctokit = Octokit.plugin(throttling);

async function main() {
    console.log("🚀 Starting GitHub commit history scraper...");

    if (!GITHUB_TOKENS_STRING) {
        console.error("❌ ERROR: GITHUB_TOKENS is not set in your .env file.");
        return;
    }
    const tokens = GITHUB_TOKENS_STRING.split(',').map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) {
        console.error("❌ ERROR: No valid tokens found in GITHUB_TOKENS.");
        return;
    }
    console.log(`🔥 Loaded ${tokens.length} GitHub token(s) for rotation.`);

    const octokitInstances = tokens.map(token => {
        return new ThrottledOctokit({
            auth: token,
            throttle: {
                onRateLimit: (retryAfter, options: any) => {
                    console.warn(`Token starting with '${token.substring(0, 8)}' hit rate limit. Retrying after ${retryAfter} seconds...`);
                    return true;
                },
                onSecondaryRateLimit: (retryAfter, options: any) => {
                    console.warn(`Token starting with '${token.substring(0, 8)}' hit abuse detection. Retrying after ${retryAfter} seconds...`);
                    return true;
                },
            },
        });
    });

    let allCommitsData: { repository: string; ecosystem: string; commits: any[] }[] = [];
    let processedRepos = new Set<string>();

    if (fs.existsSync(OUTPUT_FILE_PATH)) {
        console.log("Found existing output file. Loading previous progress...");
        const existingContent = fs.readFileSync(OUTPUT_FILE_PATH, 'utf-8');
        try {
            allCommitsData = JSON.parse(existingContent);
            for (const item of allCommitsData) {
                processedRepos.add(item.repository);
            }
            console.log(`Resuming. ${processedRepos.size} repositories have already been processed.`);
        } catch (e) {
            console.warn("⚠️  Could not parse existing output file. Starting from scratch.");
        }
    }

    const repoDataList = await parseInputFile(INPUT_FILE_PATH);
    console.log(`Found ${repoDataList.length} total repositories to analyze.`);

    let newReposProcessed = 0;
    for (let i = 0; i < repoDataList.length; i++) {
        const { owner, repo, ecosystem } = repoDataList[i];
        const fullName = `${owner}/${repo}`;

        if (processedRepos.has(fullName)) {
            continue;
        }

        const octokit = octokitInstances[i % octokitInstances.length];
        const commits = await fetchCommitsForRepo(octokit, owner, repo);

        if (commits) {
            allCommitsData.push({ repository: fullName, ecosystem: ecosystem, commits });
            newReposProcessed++;
            fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(allCommitsData, null, 2));
        }
        processedRepos.add(fullName);
    }

    console.log(`\nProcessed ${newReposProcessed} new repositories in this session.`);
    fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(allCommitsData, null, 2));
    console.log(`✅ Success! All data saved to ${OUTPUT_FILE_PATH}`);
}

// --- HELPER FUNCTIONS ---

function parseInputFile(filePath: string): Promise<{ owner: string; repo: string; ecosystem: string }[]> {
    return new Promise((resolve, reject) => {
        console.log(`Reading large file from ${filePath}... (This may take a moment)`);
        const results: { owner: string; repo: string; ecosystem: string }[] = [];

        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        rl.on('line', (line) => {
            if (line.trim() !== '') {
                try {
                    const data = JSON.parse(line);
                    const cleanedRepo = cleanRepoUrl(data.repo_url);
                    if (cleanedRepo) {
                        const cleanedEcosystem = cleanEcosystemName(data.eco_name);
                        results.push({ ...cleanedRepo, ecosystem: cleanedEcosystem });
                    }
                } catch (e) { }
            }
        });

        rl.on('close', () => resolve(results));
        rl.on('error', (err) => reject(err));
    });
}

function cleanEcosystemName(name: string): string {
    if (!name) return "Unknown";
    // This correctly handles all the formats you provided.
    return name.split(' - ')[0].trim();
}

function cleanRepoUrl(url: string): { owner: string; repo: string } | null {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname !== 'github.com') return null;

        const pathParts = parsedUrl.pathname.substring(1).replace(/.git$/, '').split('/');
        if (pathParts.length >= 2) {
            return { owner: pathParts[0], repo: pathParts[1] };
        }
        return null;
    } catch {
        return null;
    }
}

async function fetchCommitsForRepo(octokit: Octokit, owner: string, repo: string) {
    console.log(` - Fetching commits for ${owner}/${repo}...`);
    try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - DAYS_AGO);

        const response = await octokit.repos.listCommits({
            owner,
            repo,
            since: sinceDate.toISOString(),
            per_page: 100,
        });

        return response.data.map(commit => ({
            sha: commit.sha,
            author: commit.commit.author?.name || "Unknown",
            date: commit.commit.author?.date,
            message: commit.commit.message.split('\n')[0],
        }));

    } catch (error) {
        console.warn(`   ⚠️  Could not fetch commits for ${owner}/${repo}. Error: ${error}`);
        return null;
    }
}

// Run the main function
main();
