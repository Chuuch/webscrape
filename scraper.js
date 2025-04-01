import puppeteer from "puppeteer";
import fs from 'fs';
import https from 'https';
import path from "path";

(async () => {
        const browser = await puppeteer.launch({
            headless: false,
            args: [ "--enable-notifications" ],
            defaultViewport: { width: 1366, height: 768 }
        });
        const page = await browser.newPage();
        const context = browser.defaultBrowserContext();
        await context.overridePermissions("https://www.sinoptik.bg/", ["notifications"]);

        const blockedResources = [
            "googlesyndication.com",
            "doubleclick.net",
            "adservice.google.com",
            "adservice.google.bg",
            "adsystem.com",
            "analytics.google.com",
            "gstatic.com",
            "adsafeprotected.com",
            "adnxs.com",
            "adsrvr.org",
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

        await page.goto("https://www.sinoptik.bg/", {waitUntil: "networkidle2"});
        

        try {
            await page.waitForSelector('.fc-button.fc-cta-consent.fc-primary-button', {timeout: 2000});
            await page.click('.fc-button.fc-cta-consent.fc-primary-button');
        } catch (error) {
            console.error("Dialog did not appear");
        }

        await page.waitForSelector("#searchField", { timeout: 5000 });
        await page.type("#searchField", "София", { delay: 100 });
        await page.click('.searchTopButton');
        await new Promise((resolve) => setTimeout(resolve, 1000));


        await page.waitForSelector('a[href*="sofia-bulgaria"]', { timeout: 5000 });
        await page.click('a[href*="sofia-bulgaria"]');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await page.waitForSelector('#wfCloudiness', { timeout: 2000 });
        await page.click('a[href*="#wfCloudiness"]');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const dir = './cloud_images';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        async function downloadImage(url, filename) {
            const validFilenamePattern = /^cloud_\d{2}-\d{2}\.jpg$/;

            if (!validFilenamePattern.test(filename)) {
                console.log(`Skipping invalid filename: ${filename}`);
                return;
            }

            const filePath = path.join(dir, filename);
            const file = fs.createWriteStream(filePath);

            return new Promise((resolve, reject) => {
                https.get(url, (response) => {
                    response.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        console.log(`Download for ${filename} completed`);
                        resolve();
                    });
                }).on('error', (error) => {
                    fs.unlink(filePath, () => {});
                    console.error(`Download for ${filename} failed`, error);
                    reject(error);
                });
            });
        }
        await page.waitForSelector('#wfCloudiness ul li a', { visible: true });

        const timeSegments = await page.$$('#wfCloudiness ul li a');

        let latestImageUrl = "";
        
                if (!timeSegments.length === 0) {
                    console.error('No time segments found.');
                }

        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/sinoptik/images/maps/') && url !== latestImageUrl) {  
                console.log(`New Image Loaded: ${url}`);
                const filename = `cloud_${new Date().toISOString().replace(/:/g, "-")}.jpg`;
                await downloadImage(url, filename);
            }
        });


            for (const segment of timeSegments) {
                const timeLabel = await page.evaluate(el => el.textContent?.trim() || "unknown", segment);
                await page.evaluate(el => {
                    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
                }, segment);
        
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const imageUrl = await page.evaluate(() => {
                    const cloudinessSection = document.querySelector('#wfCloudiness');
                    return cloudinessSection
                    ? cloudinessSection.querySelector('.wfTpcImg img')?.src || null
                    : null;
                });

                if (imageUrl && imageUrl !== latestImageUrl) {
                    latestImageUrl = imageUrl;
                    const filename = `cloud_${timeLabel.replace(':', '-')}.jpg`;
                    await downloadImage(imageUrl, filename);
                } else {
                    console.log(`No image found for ${timeLabel}`);
                }
        }
        await browser.close();
})();