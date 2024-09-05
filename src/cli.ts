#!/usr/bin/env node

import { execSync } from 'child_process';
import * as fs from 'fs';
import { get } from 'http';
import { env } from 'process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import test from 'node:test';

dotenv.config();
// Access the token value
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
    throw new Error('GITHUB_TOKEN is not defined in the .env file');
}
let OCTOKIT: Octokit = new Octokit({ auth: githubToken, });



// Helper function to display usage information
function showUsage() {
    console.log(`Usage:
    ./run install                   # Install dependencies
    ./run <path/to/file>            # Process URLs from "URL_FILE"
    ./run test                      # Run test suite`);
}

function ASSERT_EQ(actual: number, expected: number, testName: string = ''): number {
    let threshold = 0.01;

    if (Math.abs(expected - actual) < threshold) {
        console.log(`\x1b[32m${testName}: Passed (Expected: ${expected}, Actual: ${actual})\x1b[0m`);
        return 1;
    }
    else {//📝
        console.error(`${testName}: Failed`);
        console.error(`Expected: ${expected}, Actual: ${actual}`);
        return 0;
    }
}

function ASSERT_NEAR(actual: number, expected: number, threshold: number, testName: string = ''): number {
    if (Math.abs(expected - actual) < threshold) {
        console.log(`\x1b[32m${testName}: Passed (Expected: ${expected}, Actual: ${actual})\x1b[0m`);
        return 1;
    }
    else {
        console.error(`${testName}: Failed`);
        console.error(`Expected: ${expected}, Actual: ${actual}`);
        return 0;
    }
}


// Define the Metrics class
abstract class Metrics {
    // Add a variable to the class
    public responseTime: number;
    public octokit: Octokit = OCTOKIT;

    constructor(
        public url: string,
    ) {
        this.url = url;
        this.responseTime = 0;
    }

    abstract evaluate(): Promise<number>;

    public async getRateLimitStatus() {
        const rateLimit = await OCTOKIT.rateLimit.get();
        return rateLimit.data.rate;
    }
}

class BusFactor extends Metrics {
    public busFactor: number = 0;

    constructor(url: string) {
        super(url);
    }

    async evaluate(): Promise<number> {
        const rateLimitStatus = await this.getRateLimitStatus();

        if (rateLimitStatus.remaining === 0) {
            const resetTime = new Date(rateLimitStatus.reset * 1000).toLocaleTimeString();
            console.log(`Rate limit exceeded. Try again after ${resetTime}`);
            return -1;
        }

        const startTime = performance.now();
        const { owner, repo } = await this.getRepoData(this.url);
        const commitData = await this.getCommitData(owner, repo);
        this.busFactor = this.calculateBusFactor(commitData);
        const endTime = performance.now();
        const elapsedTime = Number(endTime - startTime) / 1e6; // Convert to milliseconds
        this.responseTime = elapsedTime;

        return this.busFactor;
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
        while (true && page < 10) {
            const { data: commits } = await this.octokit.repos.listCommits({
                owner,
                repo,
                per_page: 100,
                page,
            });

            commits.forEach((commit) => {
                const author = commit.author?.login;
                if (author) {
                    commitCounts.set(author, (commitCounts.get(author) || 0) + 1);
                }
            });

            if (commits.length < 100) {
                break;
            }
            page++;
        }




        //print total number of commits 📝
        // console.log("Total number of commits:", Array.from(commitCounts.values()).reduce((a, b) => a + b, 0));
        // console.log("Commit data:", commitCounts);

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

        return Math.min(adjustedBusFactor);
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
    public rampUpTime: number = -1;

    // point values
    private folderMetrics: { [key: string]: { name: string; found: boolean } } = {
        examples: { name: 'example', found: false },
        tests: { name: 'test', found: false },
    };

    private fileMetrics: { [key: string]: { name: string; found: boolean } } = {
        readme: { name: 'readme', found: false },
        docs: { name: 'doc', found: false },
        makefile: { name: 'makefile', found: false },
    };

    constructor(
        url: string,
    ) {
        super(url);
    }

    private extractOwnerRepo(url: string): { owner: string; repo: string } {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error("Invalid GitHub URL");
        }

        return {
            owner: match[1],
            repo: match[2],
        };
    }

    async evaluate(): Promise<number> {
        return await this.printRepoStructure(this.url);
    }

    /* 
       A recursive function to print the repository structure
       and check for the presence of specific folders and files 
    */
    async printRepoStructure(url: string, path: string = ''): Promise<number> {
        try {
            const { owner, repo } = this.extractOwnerRepo(url);
    
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path,
            });
    
            if (Array.isArray(response.data)) {
                for (const item of response.data) {
                    // Check if the item is a directory
                    if (item.type === 'dir') {
                        // for each folder metric, check if the folder is found
                        for (const [key, metric] of Object.entries(this.folderMetrics)) {
                            if (item.name.toLowerCase().includes(metric.name)) {
                                console.log(`\x1b[33m${metric.name.charAt(0).toUpperCase() + metric.name.slice(1)} Found: ${item.path}\x1b[0m`);
                                this.folderMetrics[key].found = true;
                            }
                        }
                        // Recursively check subdirectories
                        await this.printRepoStructure(url, item.path);

                    // Otherwise, check if the item is a file
                    } else if (item.type === 'file') {
                        // for each file metric, check if the file is found
                        for (const [key, metric] of Object.entries(this.fileMetrics)) {
                            if (item.name.toLowerCase().includes(metric.name)) {
                                if (path === '' || metric.name === 'makefile') {
                                    console.log(`\x1b[33m${metric.name.charAt(0).toUpperCase() + metric.name.slice(1)} Found: ${item.path}\x1b[0m`);
                                    this.fileMetrics[key].found = true;
                                }
                            }
                        }
                    }
                }
            } else {
                console.log(`File: ${response.data.path}`);
            }
        } catch (error) {
            console.error("Error fetching repository structure:", error);
        }
    
        // Calculate the total score based on the found metrics
        const totalFoldersFound = Object.values(this.folderMetrics).reduce((sum, metric) => sum + (metric.found ? 1 : 0), 0);
        const totalFilesFound = Object.values(this.fileMetrics).reduce((sum, metric) => sum + (metric.found ? 1 : 0), 0);
        const totalMetrics = Object.keys(this.folderMetrics).length + Object.keys(this.fileMetrics).length;
    
        return (totalFoldersFound + totalFilesFound) / totalMetrics;
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

async function RampUpTest(): Promise<{ passed: number, failed: number }> {
    let testsPassed = 0;
    let testsFailed = 0;
    let rampUps: RampUp[] = [];

    // Ground truth data
    const groundTruth = [
        { url: "https://github.com/nullivex/nodist", expectedRampUp: 0.5 },
        { url: "https://github.com/cloudinary/cloudinary_npm", expectedRampUp: 0.5 },
        { url: "https://github.com/lodash/lodash", expectedRampUp: 0.5 },
    ];

    // Iterate over the ground truth data and run tests
    for (const test of groundTruth) {
        let rampUp = new RampUp(test.url);
        let result = await rampUp.evaluate();
        if (ASSERT_NEAR(result, test.expectedRampUp, 0.9, "Ramp Up Test")) {
            testsPassed++;
        } else {
            testsFailed++;
        }
        rampUps.push(rampUp);
    }

    return { passed: testsPassed, failed: testsFailed };
}

async function BusFactorTest(): Promise<{ passed: number, failed: number }> {
    let testsPassed = 0;
    let testsFailed = 0;
    let busFactors: BusFactor[] = [];

    //first test
    let busFactor = new BusFactor('https://github.com/cloudinary/cloudinary_npm');
    let result = await busFactor.evaluate();
    ASSERT_EQ(result, 0.3, "Bus Factor Test 1") ? testsPassed++ : testsFailed++;
    ASSERT_EQ(busFactor.responseTime, 0.004, "Bus Factor Response Time Test 1") ? testsPassed++ : testsFailed++;
    busFactors.push(busFactor);


    //second test
    busFactor = new BusFactor('https://github.com/nullivex/nodist');
    result = await busFactor.evaluate();
    ASSERT_EQ(result, 0.3, "Bus Factor Test 2") ? testsPassed++ : testsFailed++;
    ASSERT_EQ(busFactor.responseTime, 0.002, "Bus Factor Response Time Test 2") ? testsPassed++ : testsFailed++;
    busFactors.push(busFactor);

    //third test
    busFactor = new BusFactor('https://github.com/lodash/lodash');
    result = await busFactor.evaluate();
    ASSERT_EQ(result, 0.7, "Bus Factor Test 3") ? testsPassed++ : testsFailed++;
    ASSERT_EQ(busFactor.responseTime, 0.084, "Bus Factor Response Time Test 3") ? testsPassed++ : testsFailed++;
    busFactors.push(busFactor);

    return { passed: testsPassed, failed: testsFailed };
}

// Placeholder function for 'test'
async function runTests() {
    let passedTests = 0;
    let failedTests = 0;
    let results: Promise<{ passed: number, failed: number }>[] = [];
    console.log('Running tests...');
    console.log('Checking environment variables...');

    // get token from environment variable
    let status = await OCTOKIT.rateLimit.get();
    console.log(`Rate limit status: ${status.data.rate.remaining} remaining out of ${status.data.rate.limit}`);

    //Run tests
    results.push(BusFactorTest());
    results.push(RampUpTest());

    // Display test results
    for (let i = 0; i < results.length; i++) {
        let result = await results[i];
        passedTests += result.passed;
        failedTests += result.failed;
    }

    console.log(`\x1b[1;32mTests Passed: ${passedTests}\x1b[0m`);
    console.log(`\x1b[1;31mTests Failed: ${failedTests}\x1b[0m`);
    console.log('\x1b[1;34mTests complete\x1b[0m');
}

// Placeholder function for processing URLs
function processUrls(urlFile: string) {
    console.log(`Processing URLs from file: ${urlFile}`);
    // Implement URL processing logic here
}

// Main function to handle commands
function main() {
    const argv = yargs(hideBin(process.argv))
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
