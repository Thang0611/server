/**
 * Debug script to check why Course ID is not found in HTML
 * This will fetch the HTML and try to find Course ID using all methods
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');

const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';

function getCookieFromFile() {
    const cookiePath = path.join(__dirname, '../cookies.txt');
    try {
        if (!fs.existsSync(cookiePath)) {
            throw new Error(`Cookie file not found: ${cookiePath}`);
        }
        return fs.readFileSync(cookiePath, 'utf8').replace(/(\r\n|\n|\r)/gm, "").trim();
    } catch (err) {
        throw new Error(`Cannot read cookie file: ${err.message}`);
    }
}

async function debugCourseId() {
    try {
        console.log('🔍 Debugging Course ID extraction...\n');
        
        const cookieString = getCookieFromFile();
        console.log(`✅ Cookie loaded (${cookieString.length} chars)\n`);
        
        let targetUrl = testUrl.trim();
        if (!targetUrl.includes('samsungu.udemy.com')) {
            targetUrl = transformToNormalizeUdemyCourseUrl(targetUrl);
        }
        
        console.log(`📡 Fetching: ${targetUrl}\n`);
        
        // Dynamic import for got-scraping
        const { gotScraping } = await import('got-scraping');
        
        const response = await gotScraping({
            url: targetUrl,
            method: 'GET',
            http2: true,
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 110 }],
                devices: ['desktop'],
                operatingSystems: ['windows'],
            },
            headers: {
                'Cookie': cookieString,
                'Referer': targetUrl,
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Upgrade-Insecure-Requests': '1',
            },
            https: { rejectUnauthorized: false },
            retry: { limit: 0 },
            timeout: { request: 15000 }
        });
        
        console.log(`✅ Response received:`);
        console.log(`   Status: ${response.statusCode}`);
        console.log(`   Final URL: ${response.url}`);
        console.log(`   HTML Length: ${response.body.length} chars\n`);
        
        // Check for redirects
        if (response.url.includes('login') || response.url.includes('sso')) {
            console.error('❌ Redirected to login page - Cookie may be invalid!');
            return;
        }
        
        const html = response.body;
        const $ = cheerio.load(html);
        
        // Method 1: Check body attributes
        console.log('🔍 Method 1: Checking body attributes...');
        const bodyCourseId = $("body").attr("data-clp-course-id") || $("body").attr("data-course-id");
        console.log(`   data-clp-course-id: ${$("body").attr("data-clp-course-id") || 'NOT FOUND'}`);
        console.log(`   data-course-id: ${$("body").attr("data-course-id") || 'NOT FOUND'}`);
        if (bodyCourseId) {
            console.log(`   ✅ Found: ${bodyCourseId}\n`);
            return { courseId: parseInt(bodyCourseId) };
        }
        console.log('   ❌ Not found\n');
        
        // Method 2: Check div attributes
        console.log('🔍 Method 2: Checking div attributes...');
        const divCourseId = $("div[data-course-id]").attr("data-course-id") || 
                           $("div[data-clp-course-id]").attr("data-clp-course-id");
        if (divCourseId) {
            console.log(`   ✅ Found: ${divCourseId}\n`);
            return { courseId: parseInt(divCourseId) };
        }
        console.log('   ❌ Not found\n');
        
        // Method 3: Check script tags
        console.log('🔍 Method 3: Checking script tags...');
        const scriptTags = $('script').toArray();
        console.log(`   Found ${scriptTags.length} script tags`);
        
        let foundInScript = false;
        for (let i = 0; i < Math.min(scriptTags.length, 10); i++) {
            const script = scriptTags[i];
            const scriptContent = $(script).html() || '';
            if (scriptContent.length > 100) { // Only check substantial scripts
                const patterns = [
                    /"courseId"\s*:\s*(\d+)/,
                    /"course_id"\s*:\s*(\d+)/,
                    /"id"\s*:\s*(\d+)(?:\s*,\s*"title"|\s*,\s*"name")/,
                    /courseId["\s]*[:=]["\s]*(\d+)/,
                    /course_id["\s]*[:=]["\s]*(\d+)/,
                ];
                
                for (const pattern of patterns) {
                    const match = scriptContent.match(pattern);
                    if (match && match[1]) {
                        console.log(`   ✅ Found in script tag #${i}: ${match[1]}`);
                        console.log(`   Pattern: ${pattern.toString()}`);
                        foundInScript = true;
                        return { courseId: parseInt(match[1]) };
                    }
                }
            }
        }
        if (!foundInScript) {
            console.log('   ❌ Not found in script tags\n');
        }
        
        // Method 4: Check HTML body with regex
        console.log('🔍 Method 4: Checking HTML body with regex...');
        const regexList = [
            /"courseId"\s*:\s*(\d+)/,
            /"course_id"\s*:\s*(\d+)/,
            /"id"\s*:\s*(\d+),\s*"title"/,
            /data-course-id="(\d+)"/,
            /data-clp-course-id="(\d+)"/,
            /course_id&quot;:(\d+)/,
        ];
        
        for (const regex of regexList) {
            const match = html.match(regex);
            if (match && match[1]) {
                console.log(`   ✅ Found: ${match[1]}`);
                console.log(`   Pattern: ${regex.toString()}\n`);
                return { courseId: parseInt(match[1]) };
            }
        }
        console.log('   ❌ Not found\n');
        
        // Save HTML for inspection
        const htmlPath = path.join(__dirname, 'debug-html-response.html');
        fs.writeFileSync(htmlPath, html);
        console.log(`💾 HTML saved to: ${htmlPath}`);
        console.log(`   You can inspect this file to see the actual HTML structure\n`);
        
        // Show sample HTML
        console.log('📄 Sample HTML (first 1000 chars):');
        console.log('─'.repeat(80));
        console.log(html.substring(0, 1000));
        console.log('─'.repeat(80));
        console.log('\n');
        
        console.log('❌ Course ID not found using any method!');
        console.log('   Possible reasons:');
        console.log('   1. Cookie is invalid or expired');
        console.log('   2. HTML structure has changed');
        console.log('   3. Anti-bot detection is blocking the request');
        console.log('   4. Course URL is incorrect');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

// Run
if (require.main === module) {
    debugCourseId().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { debugCourseId };
