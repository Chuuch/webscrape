import puppeteer from "puppeteer";
import fs from 'fs';
import https from 'https';
import path from "path";

(async () => {

    const dir = './cloud_images';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    const browser = await puppeteer.launch({
        headless: false,
        args: ["--enable-notifications"],
        defaultViewport: { width: 1366, height: 768 }
    });
    
    const page = await browser.newPage();
    const context = browser.defaultBrowserContext();
    await context.overridePermissions("https://www.sinoptik.bg/", ["notifications"]);
    
    const blockedResources = [
        "googlesyndication.com", "doubleclick.net", "adservice.google.com",
        "adservice.google.bg", "adsystem.com", "analytics.google.com",
        "gstatic.com", "adsafeprotected.com", "adnxs.com", "adsrvr.org"
    ];
    
    await page.setRequestInterception(true);

    page.on('request', (request) => {
        const url = request.url();
        if (blockedResources.some((resource) => url.includes(resource))) {
            request.abort();
        } else {
            request.continue();
        }
    });

    async function downloadImage(url, timeLabel) {

        if (!timeLabel || timeLabel === "unknown") {
            timeLabel = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        }
        
        const filename = `cloud_${timeLabel}.jpg`;
        const filePath = path.join(dir, filename);
        const file = fs.createWriteStream(filePath);

        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (error) => {
                fs.unlink(filePath, () => {});
                reject(error);
            });
        });
    }

    try {
        await page.goto("https://www.sinoptik.bg/", {waitUntil: "networkidle2"});
        
        try {
            const consentButton = await page.$('.fc-button.fc-cta-consent.fc-primary-button');
            if (consentButton) {
                await consentButton.click();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.log("Consent dialog not found or already accepted");
        }

        await page.waitForSelector("#searchField");
        await page.type("#searchField", "София", { delay: 100 });
        await page.click('.searchTopButton');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await page.waitForSelector('a[href*="sofia-bulgaria"]');
        await page.click('a[href*="sofia-bulgaria"]');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await page.waitForSelector('#wfCloudiness');
        await page.click('a[href*="#wfCloudiness"]');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await page.waitForSelector('#wfCloudiness ul li a', { visible: true });
        const timeSegments = await page.$$('#wfCloudiness ul li a');
        
        if (!timeSegments.length) {
            throw new Error('No time segments found.');
        }
        
        const processedImageUrls = new Set();

        for (let i = 0; i < timeSegments.length; i++) {
            const segment = timeSegments[i];
            
            const timeLabel = await page.evaluate(el => el.textContent?.trim(), segment);
            
            await page.evaluate(el => {
                el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            }, segment);
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const imageUrl = await page.evaluate(() => {
                const img = document.querySelector('#wfCloudiness .wfTpcImg img');
                return img ? img.src : null;
            });
            
            if (imageUrl) {
                if (!processedImageUrls.has(imageUrl)) {
                    processedImageUrls.add(imageUrl);
                    await downloadImage(imageUrl, timeLabel);
                } else {
                    console.log(`Image already processed: ${imageUrl}`);
                }
            } else {
                console.log(`No image found for time segment: ${timeLabel || "unknown"}`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log('Process completed successfully');
    } catch (error) {
        console.error("Error during execution:", error);
    } finally {
        await browser.close();
    }
})();