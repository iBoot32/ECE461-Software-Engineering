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

/**
 * Displays the usage information for the CLI.
 */
function showUsage() {
    console.log(`Usage:
    ./run install                   # Install dependencies
    ./run <path/to/file>            # Process URLs from "URL_FILE"
    ./run test                      # Run test suite`);
}

/**
 * Retrieves the rate limit status for GitHub.
 * @returns {Promise<number>} The rate limit value.
 */
async function getRateLimitStatus() {
    const rateLimit = await OCTOKIT.rateLimit.get();
    return rateLimit.data.rate;
}

/**
 * Asserts that the actual value is equal to the expected value within a threshold.
 * 
 * @param actual - The actual value to compare.
 * @param expected - The expected value to compare against.
 * @param testName - The name of the test (optional).
 * @returns Returns 1 if the assertion passes, otherwise returns 0.
 */
function ASSERT_EQ(actual: number, expected: number, testName: string = ''): number {
    let threshold = 0.01;

    if (Math.abs(expected - actual) < threshold) {
        console.log(`\x1b[32m${testName}: Passed\x1b[0m`);
        return 1;
    }
    else {//📝
        console.error(`${testName}: Failed`);
        console.error(`Expected: ${expected}, Actual: ${actual}`);
        return 0;
    }
}

/**
 * Asserts that the actual value is less than the expected value with a threshold of 0.005.
 * 
 * @param actual - The actual value to be compared.
 * @param expected - The expected value.
 * @param testName - The name of the test (optional).
 * @returns 1 if the assertion passes, 0 otherwise.
 */
function ASSERT_LT(actual: number, expected: number, testName: string = ''): number {
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

/**
 * Asserts that the actual value is greater than the expected value with a given threshold.
 * 
 * @param actual - The actual value to be compared.
 * @param expected - The expected value to be compared against.
 * @param testName - The name of the test (optional).
 * @returns 1 if the assertion passes, 0 otherwise.
 */
function ASSERT_GT(actual: number, expected: number, testName: string = ''): number {
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

/**
 * Represents a Metrics class.
 * @abstract
 */
abstract class Metrics {
    public responseTime: number;
    public octokit: Octokit = OCTOKIT;

    constructor(
        public url: string,
    ) {
        this.url = url;
        this.responseTime = 0;
    }

    abstract evaluate(): Promise<number>;
}

/**
 * Represents a class that calculates the bus factor of a repository.
 * The bus factor is a measure of the number of developers that need to be hit by a bus (or leave the project) 
 * before it becomes infeasible to maintain the codebase.
 */
class BusFactor extends Metrics {
    public busFactor: number = 0;

    /**
     * Constructs a new instance of the CLI class.
     * @param url - The URL to connect to.
     * @param token - The authentication token to use. Optional: Use a token for higher rate limits.
     */
    constructor(url: string, token: string = githubToken as string) {
        super(url);
        this.octokit = new Octokit({
            auth: token, // Optional: Use a token for higher rate limits
        });
    }

    /**
     * Asynchronously evaluates the bus factor of a repository.
     * 
     * @returns A promise that resolves to the calculated bus factor.
     */
    async evaluate(): Promise<number> {
        const rateLimitStatus = await getRateLimitStatus();

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

    /**
     * Retrieves the owner and repository name from a given GitHub URL.
     * 
     * @param url - The GitHub URL to extract the owner and repository from.
     * @returns A promise that resolves to an object containing the owner and repository name.
     * @throws An error if the provided URL is invalid.
     */
    private async getRepoData(url: string): Promise<{ owner: string; repo: string }> {
        const regex = /https:\/\/github\.com\/([^/]+)\/([^/]+)/;
        const match = url.match(regex);
        if (!match) throw new Error("Invalid GitHub URL");

        return { owner: match[1], repo: match[2] };
    }

    /**
     * Retrieves commit data for a given owner and repository.
     * 
     * @param owner - The owner of the repository.
     * @param repo - The name of the repository.
     * @returns A Promise that resolves to a Map containing the commit data, where the keys are the authors' 
     *          usernames and the values are the number of commits made by each author.
     */
    private async getCommitData(owner: string, repo: string): Promise<Map<string, number>> {
        const commitCounts = new Map<string, number>();
        let page = 1;

        while (true) {
            const { data: commits } = await this.octokit.repos.listCommits({
                owner,
                repo,
                per_page: 1000,
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

        // print total number of commits 📝
        // console.log("Total number of commits:", Array.from(commitCounts.values()).reduce((a, b) => a + b, 0));
        // console.log("Commit data:", commitCounts);

        return commitCounts;
    }

    /**
     * Calculates the bus factor based on the commit data.
     * 
     * @param commitData - A map containing the number of commits for each contributor.
     * @returns The calculated bus factor.
     */
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

/**
 * Represents a class that calculates the correctness of a repository based on its issues data.
 * @extends Metrics
 */
class Correctness extends Metrics {
    public correctness: number = 0;

    /**
     * Constructs a new instance of the class.
     * @param url The URL to be passed to the constructor.
     */
    constructor(url: string) {
        super(url);
    }

    /**
     * Asynchronously evaluates the correctness of the code.
     * 
     * @returns A promise that resolves to the correctness value.
     */
    async evaluate(): Promise<number> {
        const rateLimitStatus = await getRateLimitStatus();

        if (rateLimitStatus.remaining === 0) {
            const resetTime = new Date(rateLimitStatus.reset * 1000).toLocaleTimeString();
            console.log(`Rate limit exceeded. Try again after ${resetTime}`);
            return -1;
        }

        // Calculate response time of evaluate method
        const startTime = new Date().getTime();
        this.correctness = await this.calculateCorrectness();
        const endTime = new Date().getTime();
        this.responseTime = (endTime - startTime) / 1000

        return this.correctness;
    }

    /**
     * Calculates the correctness of the system based on the number of open bug issues and total open issues.
     * 
     * @returns A Promise that resolves to a number representing the correctness of the system.
     *          Returns 1 if there are no issues reported.
     *          Returns a value between 0 and 1 representing the correctness percentage if there are issues.
     *          Returns -1 if there was an error calculating the correctness.
     */
    private async calculateCorrectness(): Promise<number> {
        try {
            // Fetch the issues data from the repository
            const { openBugIssues, totalOpenIssues } = await this.fetchIssuesData();

            // Check if total issues count is zero to prevent division by zero
            if (totalOpenIssues === 0) {
                return 1; // Assuming correctness is perfect if there are no issues
            }

            // Calculate correctness
            const correctness = 1 - (openBugIssues / totalOpenIssues);
            return correctness;
        } catch (error) {
            console.error('Error calculating correctness:', error);
            return -1;
        }
    }

    /**
     * Fetches the issues data from the repository.
     * 
     * @returns A promise that resolves to an object containing the number of open bug issues 
     *          and the total number of open issues.
     * @throws {Error} If the repository URL is invalid or if there is an error fetching the data.
     */
    private async fetchIssuesData(): Promise<{ openBugIssues: number; totalOpenIssues: number }> {
        try {
            // Extract the owner and repo from the URL
            const repoInfo = this.extractRepoInfo();
            if (!repoInfo) {
                throw new Error('Invalid repository URL');
            }

            const { owner, repo } = repoInfo;
            const { data } = await this.octokit.issues.listForRepo({
                owner,
                repo,
                state: 'all',
                labels: 'bug', // Filter by bug label
                per_page: 100
            });

            // Count open and total issues
            const openBugIssues = data.filter(issue => issue.state === 'open').length;
            const totalOpenIssues = data.length;
            
            return { openBugIssues, totalOpenIssues };
        } catch (error) {
            console.error('Error fetching issues data:', error);
            throw error;
        }
    }

    /**
     * Extracts the owner and repository name from a GitHub URL.
     * 
     * @returns An object containing the owner and repo properties, or null if the URL is invalid.
     */
    private extractRepoInfo(): { owner: string; repo: string } | null {
        // Regex to parse GitHub URL and extract owner and repository name
        const regex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)/;
        const match = this.url.match(regex);

        if (match && match.length >= 3) {
            return { owner: match[1], repo: match[2] };
        }
        return null;
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

/**
 * Performs correctness tests on the given URLs and returns the number of tests passed and failed.
 *
 * @returns A promise that resolves to an object containing the number of tests passed and failed.
 */
async function CorrectnessTest(): Promise<{ passed: number, failed: number }> {
    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1
    const correctness = new Correctness('https://github.com/cloudinary/cloudinary_npm');
    const result: number = await correctness.evaluate();
    const expectedValue = 0.933333333; // Expected value is 0.93333...
    ASSERT_EQ(result, expectedValue, 'Correctness test 1') ? testsPassed++ : testsFailed++;
    console.log(`Response time: ${correctness.responseTime}s\n`);

    // Test 2
    const correctness2 = new Correctness('https://github.com/nullivex/nodist');
    const result2: number = await correctness2.evaluate();
    const expectedValue2 = 0.90909091; // Expected value is 0.90909091
    ASSERT_EQ(result2, expectedValue2, 'Correctness test 2') ? testsPassed++ : testsFailed++;
    console.log(`Response time: ${correctness2.responseTime}s\n`);

    // Test 3
    const correctness3 = new Correctness('https://github.com/Coop8/Coop8');
    const result3: number = await correctness3.evaluate();
    const expectedValue3 = 1; // Expected value is 1
    ASSERT_EQ(result3, expectedValue3, 'Correctness test 3') ? testsPassed++ : testsFailed++;
    console.log(`Response time: ${correctness3.responseTime}s\n`);

    return { passed: testsPassed, failed: testsFailed };
}

/**
 * Runs the tests and displays the results and timings.
 * 
 * @returns {Promise<void>} A promise that resolves when the tests are completed.
 */
async function runTests() {
    let passedTests = 0;
    let failedTests = 0;
    let results: Promise<{ passed: number, failed: number }>[] = [];
    console.log('Running tests...');
    console.log('Checking environment variables...');

    // get token from environment variable
    let status = await getRateLimitStatus();
    console.log(`Rate limit status: ${status.remaining} out of ${status.limit}`);

    // Run tests
    // results.push(BusFactorTest());
    results.push(CorrectnessTest());

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

/**
 * The main function. Handles command line arguments and executes the appropriate functions.
 */
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