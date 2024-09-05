#!/usr/bin/env node
import * as fs from 'fs';
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
let OCTOKIT = new Octokit({ auth: githubToken, });
// Helper function to display usage information
function showUsage() {
    console.log(`Usage:
    ./run install                   # Install dependencies
    ./run <path/to/file>            # Process URLs from "URL_FILE"
    ./run test                      # Run test suite`);
}
function ASSERT_EQ(actual, expected, testName = '') {
    let threshold = 0.01;
    if (Math.abs(expected - actual) < threshold) {
        console.log(`\x1b[32m${testName}: Passed (Expected: ${expected}, Actual: ${actual})\x1b[0m`);
        return 1;
    }
    else { //📝
        console.error(`${testName}: Failed`);
        console.error(`Expected: ${expected}, Actual: ${actual}`);
        return 0;
    }
}
function ASSERT_NEAR(actual, expected, threshold, testName = '') {
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
class Metrics {
    url;
    // Add a variable to the class
    responseTime;
    octokit = OCTOKIT;
    constructor(url) {
        this.url = url;
        this.url = url;
        this.responseTime = 0;
    }
    async getRateLimitStatus() {
        const rateLimit = await OCTOKIT.rateLimit.get();
        return rateLimit.data.rate;
    }
}
class BusFactor extends Metrics {
    busFactor = 0;
    constructor(url) {
        super(url);
    }
    async evaluate() {
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
    async getRepoData(url) {
        const regex = /https:\/\/github\.com\/([^/]+)\/([^/]+)/;
        const match = url.match(regex);
        if (!match)
            throw new Error("Invalid GitHub URL");
        return { owner: match[1], repo: match[2] };
    }
    async getCommitData(owner, repo) {
        const commitCounts = new Map();
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
    calculateBusFactor(commitData) {
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
    correctness;
    constructor(url) {
        super(url);
        this.correctness = this.evaluate();
    }
    async evaluate() {
        // Implement the evaluate method
        return -1;
    }
}
class Maintainability extends Metrics {
    // Add a variable to the class
    maintainability;
    constructor(url) {
        super(url);
        this.maintainability = this.evaluate();
    }
    async evaluate() {
        // Implement the evaluate method
        return -1;
    }
}
class RampUp extends Metrics {
    // Add a variable to the class
    rampUpTime = -1;
    // point values
    Metrics = {
        example: { name: 'example', found: false, fileType: 'either' },
        test: { name: 'test', found: false, fileType: 'either' },
        readme: { name: 'readme', found: false, fileType: 'file' },
        doc: { name: 'doc', found: false, fileType: 'either' },
        makefile: { name: 'makefile', found: false, fileType: 'file' },
    };
    constructor(url) {
        super(url);
    }
    extractOwnerRepo(url) {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error("Invalid GitHub URL");
        }
        return {
            owner: match[1],
            repo: match[2],
        };
    }
    async evaluate() {
        const startTime = performance.now();
        this.rampUpTime = await this.printRepoStructure(this.url);
        const endTime = performance.now();
        const elapsedTime = Number(endTime - startTime) / 1e6; // Convert to milliseconds
        this.responseTime = elapsedTime;
        return this.rampUpTime;
    }
    /*
       A recursive function to print the repository structure
       and check for the presence of specific folders and files
    */
    async printRepoStructure(url, path = '') {
        try {
            const { owner, repo } = this.extractOwnerRepo(url);
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path,
            });
            if (Array.isArray(response.data)) {
                for (const item of response.data) {
                    // check each metric to see if it is found
                    for (const [key, metric] of Object.entries(this.Metrics)) {
                        // ensure the item type = metric type, or the metric type is 'either'. Then check if the metric name is in the item name
                        if ((item.type === metric.fileType || metric.fileType === 'either') && item.name.toLowerCase().includes(metric.name)) {
                            // console.log(`\x1b[33m${metric.name.charAt(0).toUpperCase() + metric.name.slice(1)} Found: ${item.path}\x1b[0m`);
                            this.Metrics[key].found = true;
                        }
                    }
                    // Recursively check subdirectories after checking each metric
                    if (item.type === 'dir') {
                        await this.printRepoStructure(url, item.path);
                    }
                }
            }
        }
        catch (error) {
            console.error("Error fetching repository structure:", error);
        }
        // Calculate the total score based on the found metrics
        const totalFound = Object.values(this.Metrics).reduce((sum, metric) => sum + (metric.found ? 1 : 0), 0);
        const totalMetrics = Object.keys(this.Metrics).length;
        return (totalFound) / totalMetrics;
    }
}
class License extends Metrics {
    // Add a variable to the class
    license;
    constructor(url) {
        super(url);
        this.license = this.evaluate();
    }
    async evaluate() {
        // Implement the evaluate method
        return -1;
    }
}
class NetScore extends Metrics {
    // Add a variable to the class
    weights = [19.84, 7.47, 30.69, 42.0];
    netScore;
    busFactor = -1;
    correctness = -1;
    maintainability = -1;
    rampUpTime = -1;
    license = false;
    constructor(url) {
        super(url);
        this.netScore = this.evaluate();
    }
    async evaluate() {
        // Implement the evaluate method
        return -1;
    }
    toString() {
        // Implement the toString method
        return 'NetScore: ${this.netScore}';
    }
}
async function RampUpTest() {
    let testsPassed = 0;
    let testsFailed = 0;
    let rampUps = [];
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
        ASSERT_EQ(result, test.expectedRampUp, `RampUp Test for ${test.url}`) ? testsPassed++ : testsFailed++;
        rampUps.push(rampUp);
    }
    return { passed: testsPassed, failed: testsFailed };
}
async function BusFactorTest() {
    let testsPassed = 0;
    let testsFailed = 0;
    let busFactors = [];
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
    let results = [];
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
function processUrls(urlFile) {
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
        let filename = argv.file;
        if (fs.existsSync(filename)) {
            processUrls(filename);
        }
        else {
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
