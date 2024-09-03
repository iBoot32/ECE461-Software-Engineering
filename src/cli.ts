#!/usr/bin/env node

import { execSync } from 'child_process';
import * as fs from 'fs';
import { get } from 'http';
import { env } from 'process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();
// Access the token value
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
    throw new Error('GITHUB_TOKEN is not defined in the .env file');
}



// Helper function to display usage information
function showUsage() {
    console.log(`Usage:
    ./cli.js install                   # Install dependencies
    ./cli.js <path/to/file>            # Process URLs from "URL_FILE"
    ./cli.js test                      # Run test suite`);
}

async function getRateLimitStatus(token: string): Promise<{ remaining: number; limit: number }> {
    const rateLimit = await new Octokit({ auth: token }).rateLimit.get();
    return rateLimit.data.rate;
}


// Define the Metrics class
abstract class Metrics {
    // Add a variable to the class
    public responseTime: number;

    constructor(
        public url: string,
    ) {
        this.url = url;
        this.responseTime = 0;
    }

    abstract evaluate(): Promise<number>;
}
class BusFactor extends Metrics {
    private octokit: Octokit;
    public busFactor: number = 0;

    constructor(url: string, token: string = githubToken as string) {
        super(url);
        this.octokit = new Octokit({
            auth: token, // Optional: Use a token for higher rate limits
        });
    }

    async evaluate(): Promise<number> {
        const rateLimitStatus = await this.getRateLimitStatus();

        if (rateLimitStatus.remaining === 0) {
            const resetTime = new Date(rateLimitStatus.reset * 1000).toLocaleTimeString();
            console.log(`Rate limit exceeded. Try again after ${resetTime}`);
            return -1;
        }

        const { owner, repo } = await this.getRepoData(this.url);
        const commitData = await this.getCommitData(owner, repo);
        this.busFactor = this.calculateBusFactor(commitData);

        return this.busFactor;
    }

    private async getRateLimitStatus() {
        const rateLimit = await this.octokit.rateLimit.get();
        return rateLimit.data.rate;
    }

    private async getRepoData(url: string): Promise<{ owner: string; repo: string }> {
        const regex = /https:\/\/github\.com\/([^/]+)\/([^/]+)/;
        const match = url.match(regex);
        if (!match) throw new Error("Invalid GitHub URL");

        return { owner: match[1], repo: match[2] };
    }

    private async getCommitData(owner: string, repo: string): Promise<Map<string, number>> {
        const commitCounts = new Map<string, number>();
        let page = 1;

        while (true) {
            const { data: commits } = await this.octokit.repos.listCommits({
                owner,
                repo,
                per_page: 100,
                page,
            });

            if (commits.length === 0) break;

            commits.forEach((commit) => {
                const author = commit.author?.login;
                if (author) {
                    commitCounts.set(author, (commitCounts.get(author) || 0) + 1);
                }
            });

            page++;
        }

        return commitCounts;
    }

    private calculateBusFactor(commitData: Map<string, number>): number {
        const totalCommits = Array.from(commitData.values()).reduce((a, b) => a + b, 0);
        const sortedContributors = Array.from(commitData.entries()).sort((a, b) => b[1] - a[1]);

        let commitSum = 0;
        let i = 0;
        while (commitSum < totalCommits * 0.5) {
            commitSum += sortedContributors[i][1];
            i++;
        }

        const rawBusFactor = i / sortedContributors.length;
        const adjustedBusFactor = rawBusFactor * 2;

        return adjustedBusFactor;
    }
}


class Correctness extends Metrics {
    // Add a variable to the class
    public correctness: Promise<number>;
    constructor(
        url: string,
    ) {
        super(url);
        this.correctness = this.evaluate();
    }

    async evaluate(): Promise<number> {
        // Implement the evaluate method
        return -1;
    }
}

class Maintainability extends Metrics {
    // Add a variable to the class
    public maintainability: Promise<number>;
    constructor(
        url: string,
    ) {
        super(url);
        this.maintainability = this.evaluate();
    }

    async evaluate(): Promise<number> {
        // Implement the evaluate method
        return -1;
    }
}

class RampUp extends Metrics {
    // Add a variable to the class
    public rampUpTime: Promise<number>;
    constructor(
        url: string,
    ) {
        super(url);
        this.rampUpTime = this.evaluate();
    }

    async evaluate(): Promise<number> {
        // Implement the evaluate method
        return -1;
    }
}

class License extends Metrics {
    // Add a variable to the class
    public license: Promise<number>;
    constructor(
        url: string,
    ) {
        super(url);
        this.license = this.evaluate();
    }

    async evaluate(): Promise<number> {
        // Implement the evaluate method
        return -1;
    }
}

class NetScore extends Metrics {
    // Add a variable to the class
    weights: Array<number> = [19.84, 7.47, 30.69, 42.0];
    public netScore: Promise<number>;
    public busFactor: number = -1;
    public correctness: number = -1
    public maintainability: number = -1;
    public rampUpTime: number = -1;
    public license: boolean = false;

    constructor(
        url: string,
    ) {
        super(url);
        this.netScore = this.evaluate();
    }

    async evaluate(): Promise<number> {
        // Implement the evaluate method
        return -1;
    }

    toString(): string {
        // Implement the toString method
        return 'NetScore: ${this.netScore}';
    }

}

// Placeholder function for 'install'
function installDependencies() {
    console.log('Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
}

async function BusFactorTest() {
    const busFactor = new BusFactor('https://github.com/cloudinary/cloudinary_npm');
    const result: number = await busFactor.evaluate();
    console.log(`Bus factor: ${result}`);
}

// Placeholder function for 'test'
async function runTests() {
    console.log('Running tests...');
    console.log('Checking environment variables...');

    // get token from environment variable
    console.log(`Token: ${githubToken}`);

    let status = await getRateLimitStatus(env.GITHUB_TOKEN || '');
    console.log(`Rate limit status: ${status.remaining} out of ${status.limit}`);

    //Run tests
    await BusFactorTest();
}

// Placeholder function for processing URLs
function processUrls(urlFile: string) {
    console.log(`Processing URLs from file: ${urlFile}`);
    // Implement URL processing logic here
}

// Main function to handle commands
function main() {
    const argv = yargs(hideBin(process.argv))
        .command('install', 'Install dependencies', {}, () => {
            installDependencies();
        })
        .command('test', 'Run test suite', {}, () => {
            runTests();
        })
        .command('$0 <file>', 'Process URLs from a file', (yargs) => {
            yargs.positional('file', {
                describe: 'Path to the file containing URLs',
                type: 'string'
            });
        }, (argv) => {
            let filename: string = argv.file as string;
            if (fs.existsSync(filename)) {
                processUrls(filename);
            } else {
                console.error(`File not found: ${argv.file}`);
                showUsage();
                process.exit(1);
            }
        })
        .help()
        .alias('help', 'h')
        .argv;

}

main();
