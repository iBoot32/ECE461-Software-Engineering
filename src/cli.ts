#!/usr/bin/env node

import * as git from 'isomorphic-git';
import * as path from 'path';
import http from 'isomorphic-git/http/node/index.cjs';
import * as fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import test from 'node:test';
import redline from 'readline';

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
        console.log(`\x1b[32m${testName}:\tPassed\x1b[0m`);
        return 1;
    }
    else {//📝
        console.error(`${testName}:\tFailed\tExpected: ${expected}, Actual: ${actual}`);
        return 0;
    }
}

// assert if the actual value is less than the expected value - some threshold
function ASSERT_L(actual: number, expected: number, testName: string = ''): number {
    let threshold = 0.005;

    if (actual < (expected + threshold)) {
        console.log(`\x1b[32m${testName}:\tPassed\x1b[0m`);
        return 1;
    }
    else {
        console.error(`${testName}:\tFailed\tExpected: ${expected}, Actual: ${actual}`);
        return 0;
    }
}

// assert if the actual value is greater than the expected value + some threshold
function ASSERT_G(actual: number, expected: number, testName: string = ''): number {
    let threshold = 0.01;

    if (actual > (expected - threshold)) {
        console.log(`\x1b[32m${testName}: Passed\x1b[0m`);
        return 1;
    }
    else {
        console.error(`${testName}: Failed\tExpected: ${expected}, Actual: ${actual}`);
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
    public busFactor: number = -1;

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
    public license: number = -1;
    constructor(
        url: string,
    ) {
        super(url);

    }

    // Helper function to clone the repository
    private async cloneRepository(cloneDir: string): Promise<void> {
        await git.clone({
            fs,
            http,
            dir: cloneDir,
            url: this.url,
            singleBranch: true,
            depth: 1,
        });
    }

    // Helper function to check license compatibility
    private checkLicenseCompatibility(licenseText: string): number {
        const compatibleLicenses = [
            'LGPL-2.1',
            'LGPL-2.1-only',
            'LGPL-2.1-or-later',
            'GPL-2.0',
            'GPL-2.0-only',
            'GPL-2.0-or-later',
            'MIT',
            'BSD-2-Clause',
            'BSD-3-Clause',
            'Apache-2.0',
            'MPL-1.1',
            // Add more compatible licenses here
        ];

        // Simple regex to find the license type in the text
        const licenseRegex = new RegExp(compatibleLicenses.join('|'), 'i');
        return licenseRegex.test(licenseText) ? 1 : 0;
    }

    // Helper function to extract license information from README or LICENSE file
    private async extractLicenseInfo(cloneDir: string): Promise<string | null> {
        let licenseInfo: string | null = null;

        // Case-insensitive file search for README (e.g., README.md, README.MD)
        const readmeFiles = fs.readdirSync(cloneDir).filter(file =>
            file.match(/^readme\.(md|txt)?$/i)
        );

        if (readmeFiles.length > 0) {
            const readmePath = path.join(cloneDir, readmeFiles[0]);
            const readmeContent = fs.readFileSync(readmePath, 'utf-8');
            const licenseSection = readmeContent.match(/##\s*(Licence|Legal)(\s|\S)*/i);
            if (licenseSection) {
                licenseInfo = licenseSection[0];
            }
        }

        // Case-insensitive file search for LICENSE (e.g., LICENSE.txt, license.md)
        const licenseFiles = fs.readdirSync(cloneDir).filter(file =>
            file.match(/^licen[sc]e(\..*)?$/i)
        );

        if (licenseFiles.length > 0) {
            const licenseFilePath = path.join(cloneDir, licenseFiles[0]);
            const licenseContent = fs.readFileSync(licenseFilePath, 'utf-8');
            if (licenseInfo) {
                licenseInfo += '\n' + licenseContent;
            } else {
                licenseInfo = licenseContent;
            }
        }

        return licenseInfo;
    }

    // The main evaluate function to implement the license check
    async evaluate(): Promise<number> {
        const cloneDir = path.join('/tmp', 'repo-clone');
        try {
            await this.cloneRepository(cloneDir);

            const licenseInfo = await this.extractLicenseInfo(cloneDir);
            // console.log('\x1b[34mLicense info:\n', licenseInfo, '\x1b[0m'); //📝
            if (licenseInfo) {
                this.license = this.checkLicenseCompatibility(licenseInfo);
            } else {
                this.license = -1; // No license information found
            }
        } catch (error) {
            console.error('Error evaluating license:', error);
            this.license = -1; // On error, assume incompatible license
        } finally {
            // Clean up: remove the cloned repository
            fs.rmSync(cloneDir, { recursive: true, force: true });
        }
        return this.license;
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

async function BusFactorTest(): Promise<{ passed: number, failed: number }> {
    let testsPassed = 0;
    let testsFailed = 0;
    let busFactors: BusFactor[] = [];

    //first test
    let busFactor = new BusFactor('https://github.com/cloudinary/cloudinary_npm');
    let result = await busFactor.evaluate();
    ASSERT_EQ(result, 0.3, "Bus Factor Test 1") ? testsPassed++ : testsFailed++;
    ASSERT_L(busFactor.responseTime, 0.004, "Bus Factor Response Time Test 1") ? testsPassed++ : testsFailed++;
    busFactors.push(busFactor);


    //second test
    busFactor = new BusFactor('https://github.com/nullivex/nodist');
    result = await busFactor.evaluate();
    ASSERT_EQ(result, 0.3, "Bus Factor Test 2") ? testsPassed++ : testsFailed++;
    ASSERT_L(busFactor.responseTime, 0.002, "Bus Factor Response Time Test 2") ? testsPassed++ : testsFailed++;
    busFactors.push(busFactor);

    //third test
    busFactor = new BusFactor('https://github.com/lodash/lodash');
    result = await busFactor.evaluate();
    ASSERT_EQ(result, 0.7, "Bus Factor Test 3") ? testsPassed++ : testsFailed++;
    ASSERT_L(busFactor.responseTime, 0.084, "Bus Factor Response Time Test 3") ? testsPassed++ : testsFailed++;
    busFactors.push(busFactor);

    return { passed: testsPassed, failed: testsFailed };
}

async function LicenseTest(): Promise<{ passed: number, failed: number }> {
    let testsPassed = 0;
    let testsFailed = 0;
    let licenses: License[] = [];

    //first test
    let license = new License('https://github.com/cloudinary/cloudinary_npm');
    let result = await license.evaluate();
    ASSERT_EQ(result, 1, "License Test 1") ? testsPassed++ : testsFailed++;
    licenses.push(license);

    //second test
    license = new License('https://github.com/nullivex/nodist');
    result = await license.evaluate();
    ASSERT_EQ(result, 1, "License Test 2") ? testsPassed++ : testsFailed++;
    licenses.push(license);

    //third test
    license = new License('https://github.com/lodash/lodash');
    result = await license.evaluate();
    ASSERT_EQ(result, 1, "License Test 3") ? testsPassed++ : testsFailed++;
    licenses.push(license);

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
    // results.push(BusFactorTest());
    results.push(LicenseTest());

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
