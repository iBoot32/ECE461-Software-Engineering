#!/usr/bin/env node

import { execSync } from 'child_process';
import * as fs from 'fs';

const args = process.argv.slice(2);

// Helper function to display usage information
function showUsage() {
    console.log(`Usage:
    ./cli.js install                   # Install dependencies
    ./cli.js URL_FILE <path/to/file>   # Process URLs from "URL_FILE"
    ./cli.js test                      # Run test suite`);
}

// Main function to handle commands
function main() {
    if (args.length === 0) {
        showUsage();
        process.exit(1);
    }

    const command = args[0];

    switch (command) {
        case '--help':
            showUsage();
            break;
        case 'install':
            installDependencies();
            break;
        case 'test':
            runTests();
            break;
        default:
            if (fs.existsSync(command)) {
                processUrls(command);
            } else {
                console.error(`Unknown command or file not found: ${command}`);
                showUsage();
                process.exit(1);
            }
            break;
    }
}

abstract class Metrics {
    // Add a variable to the class
    public responseTime: number;

    constructor(
        public url: string,
    ) {
        //  call the evaluate method
        this.url = url;
        this.responseTime = 0;
    }

    abstract evaluate(): number;
}

class BusFactor extends Metrics {
    // Add a variable to the class
    constructor(
        url: string,
        public busFactor: number
    ) {
        super(url);
        this.busFactor = this.evaluate();

    }

    evaluate(): number {
        // Implement the evaluate method
        return -1;
    }
}

class Correctness extends Metrics {
    // Add a variable to the class
    constructor(
        url: string,
        public correctness: number
    ) {
        super(url);
        this.correctness = this.evaluate();
    }

    evaluate(): number {
        // Implement the evaluate method
        return -1;
    }
}

class Maintainability extends Metrics {
    // Add a variable to the class
    constructor(
        url: string,
        public maintainability: number
    ) {
        super(url);
        this.maintainability = this.evaluate();
    }

    evaluate(): number {
        // Implement the evaluate method
        return -1;
    }
}

class RampUp extends Metrics {
    // Add a variable to the class
    constructor(
        url: string,
        public rampUpTime: number
    ) {
        super(url);
        this.rampUpTime = this.evaluate();
    }

    evaluate(): number {
        // Implement the evaluate method
        return -1;
    }
}

class License extends Metrics {
    // Add a variable to the class
    constructor(
        url: string,
        public license: number
    ) {
        super(url);
        this.license = this.evaluate();
    }

    evaluate(): number {
        // Implement the evaluate method
        return -1;
    }
}

class NetScore extends Metrics {
    // Add a variable to the class
    weights: Array<number> = [19.84, 7.47, 30.69, 42.0];
    public netScore: number
    constructor(
        url: string,
    ) {
        super(url);
        this.netScore = this.evaluate();
    }

    evaluate(): number {
        // Implement the evaluate method
        return -1;
    }

    toString(): string {
        // Implement the toString method
        return '';
    }

}

// Placeholder function for 'install'
function installDependencies() {
    console.log('Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
}

// Placeholder function for 'test'
function runTests() {
    console.log('Running tests...');
    // Implement test running logic here
}

// Placeholder function for processing URLs
function processUrls(urlFile: string) {
    console.log(`Processing URLs from file: ${urlFile}`);
    // Implement URL processing logic here
}

main();
