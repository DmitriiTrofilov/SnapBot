const puppeteer = require("puppeteer-extra");
const Stealth = require("puppeteer-extra-plugin-stealth");
puppeteer.use(Stealth());

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

class SnapBot {
  constructor() {
    this.page = null;
    this.browser = null;
  }

  /**
   * Launches the Snapchat browser instance.
   * @param {Object} options - Options for launching Puppeteer.
   * @param {boolean} [options.headless=true] - Whether to run the browser in headless mode.
   */
  async lauchSnapchat(options = {}) {
    try {
      this.browser = await puppeteer.launch({
        headless: options.headless !== undefined ? options.headless : true, // Prioritize 'options.headless', otherwise default to true
        args: [
          '--no-sandbox',           // Essential for server environments like Render
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Helps with limited /dev/shm space in containers
          '--disable-gpu',           // Recommended for server environments without a GPU
          '--no-zygote',             // Can improve stability in some server setups
          '--single-process'         // Can help with resource management in constrained environments
        ],
        // Uncomment and adjust 'executablePath' only if you encounter "browser not found" errors
        // on Render despite the build command. Try deploying without it first.
        // executablePath: process.env.PUPPETEER_EXEC_PATH || '/usr/bin/google-chrome-stable'
      });

      const context = await this.browser.createBrowserContext();
      await context.overridePermissions("https://web.snapchat.com", [
        "camera",
        "microphone",
      ]);
      this.page = await context.newPage();

      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      );

      await this.page.goto("https://www.snapchat.com/?original_referrer=none");
      await this.page.waitForNetworkIdle(); // Ensure the page is loaded before proceeding
    } catch (error) {
      console.error(`Error while Starting Snapchat : ${error}`);
      throw error; // Re-throw to indicate a critical failure
    }
  }

  /**
   * Logs into Snapchat using the provided credentials.
   * @param {Object} credentials - Object containing username and password.
   * @param {string} credentials.username - Snapchat username.
   * @param {string} credentials.password - Snapchat password.
   */
  async login(credentials) {
    const { username, password } = credentials;
    if (!username || !password) { // Improved check for empty credentials
      throw new Error("Credentials cannot be empty.");
    }
    try {
      // Enter username
      const defaultLoginBtn = await this.page.$("#ai_input"); // Check for an alternative input field if exists
      const loginBtn = await this.page.$('input[name="accountIdentifier"]');

      if (loginBtn) {
        // await this.page.waitForNetworkIdle(); // This might be redundant or problematic if already waited
        console.log("Entering username...");
        await this.page.type('input[name="accountIdentifier"]', username, {
          delay: 100,
        });
      } else if (defaultLoginBtn) { // Using else if to avoid double type
        console.log("Entering username...");
        await this.page.type("#ai_input", username, { delay: 100 });
      } else {
          console.warn("No identifiable username input field found, attempting to continue.");
      }

      await this.page.click("button[type='submit']");
    } catch (e) {
      console.error("Username field error:", e);
      throw e; // Re-throw to indicate a critical failure
    }

    try {
      //Enter Password
      console.log("Waiting for password field...");
      await this.page.waitForSelector("#password", {
        visible: true,
        timeout: 15000,
      });
      await this.page.type("#password", password, { delay: 100 });
      console.log("Password field filled.");
    } catch (e) {
      console.error("Password field loading error:", e);
      throw e; // Re-throw to indicate a critical failure
    }

    await this.page.click("button[type='submit']");
    await delay(5000); // Give time for login to process

    // Click "Not now" for potential save password popup
    try {
      const notNowBtn = ".NRgbw.eKaL7.Bnaur"; // This selector might change. Be vigilant.
      console.log("Checking for 'Not now' button...");
      await this.page.waitForSelector(notNowBtn, {
        visible: true,
        timeout: 5000,
      });
      await this.page.click(notNowBtn);
      console.log("Clicked 'Not now' button.");
    } catch (e) {
      console.log("Popup handling error or popup not found (this is often fine):", e.message); // Log message, but don't crash if it's just not present
    }
    await delay(1000);
  }

  /**
   * Captures a snap and applies a caption.
   * @param {Object} obj - Options for capturing the snap.
   * @param {string} [obj.caption=""] - The caption to add to the snap.
   */
  async captureSnap(obj) {
    try {
        // Click the capture button (assuming SVG or similar)
        const svgButton = await this.page.$("button.qJKfS");
        if (svgButton) {
            await this.page.click("button.qJKfS");
            console.log("Clicked SVG camera button.");
        } else {
            console.warn("SVG camera button not found. Assuming capture button is main button.");
        }


        // Main capture button
        await this.page.waitForSelector("button.FBYjn.gK0xL.A7Cr_.m3ODJ", { visible: true });
        await this.page.click("button.FBYjn.gK0xL.A7Cr_.m3ODJ");
        console.log("Clicked main capture button.");
        await delay(1000);

        if (obj.caption && obj.caption !== "") { // Check if caption exists and is not empty
            await delay(2000); // Give time for UI to update after capture
            await this.page.waitForSelector('button.eUb32[title="Add a caption"]', { visible: true });
            await this.page.click('button.eUb32[title="Add a caption"]');
            console.log("Clicked 'Add a caption' button.");
            await delay(1000); // Give time for caption input to appear
            await this.page.waitForSelector('textarea.B9QiX[aria-label="Caption Input"]', { visible: true });
            await this.page.type('textarea.B9QiX[aria-label="Caption Input"]', obj.caption, { delay: 100 });
            console.log("Caption entered.");
            await delay(1000); // Give time for input to register
        }
    } catch (error) {
        console.error(`Error while capturing snap or adding caption: ${error}`);
        throw error;
    }
  }

  /**
   * Sends the snap to specified recipients.
   * @param {string} person - Recipient group ("BestFriends", "friends", "groups").
   */
  async send(person) {
    try {
      const button = await this.page.$("button.YatIx.fGS78.eKaL7.Bnaur"); // Send button after capture
      if (button) {
        console.log("Found send button after capture.");
        await button.click();
      } else {
        console.error("Send button after capture not found.");
        throw new Error("Send button not found.");
      }
      await delay(1000);

      let selectedSelector = "";
      person = person.toLowerCase(); // Ensure case-insensitivity

      if (person === "bestfriends") { // Changed from "broups" as per usage, fixed typo
        selectedSelector = "ul.UxcmY li div.Ewflr.cDeBk.A8BRr";
      } else if (person === "groups") { // Fixed typo to "groups"
        selectedSelector = "li div.RbA83";
      } else if (person === "friends") {
        selectedSelector = "li div.Ewflr";
      } else if (person === "all") {
        console.warn("Sending to 'all' is not implemented yet. Please select specific groups.");
        throw new Error("Option 'all' not implemented.");
      } else {
        throw new Error(`Invalid send option: '${person}'. Choose from "BestFriends", "friends", "groups".`);
      }

      console.log(`Selecting recipients for: ${person}`);
      await this.page.waitForSelector(selectedSelector, { visible: true, timeout: 10000 }); // Wait for at least one selector
      const accounts = await this.page.$$(selectedSelector);

      if (accounts.length === 0) {
          console.warn(`No accounts found for selector: ${selectedSelector}`);
          // Decide if this should be a critical error or if it's okay to continue (e.g., no best friends)
          throw new Error(`No recipients found for "${person}".`);
      }

      for (const account of accounts) {
        // Simple visibility check, Puppeteer's click usually handles scroll/visibility for visible elements
        await account.click();
        // console.log("Clicked an account/group."); // Too verbose for loop
      }
      console.log(`Selected ${accounts.length} recipients.`);

      const finalSendButton = await this.page.$("button.TYX6O.eKaL7.Bnaur"); // The final 'Send' button on the recipient screen
      if (finalSendButton) {
        await finalSendButton.click();
        console.log("Clicked final send button.");
      } else {
        console.error("Final send button not found.");
        throw new Error("Final send button not found.");
      }

      await delay(5000); // Give time for snap to send
    } catch (error) {
      console.error(`Error while sending snap: ${error}`);
      throw error;
    }
  }

  /**
   * Closes the browser session.
   */
  async closeBrowser() {
    try {
        await delay(5000); // Give some buffer time
        if (this.browser) {
            await this.browser.close();
            console.log("Snapchat browser closed.");
        } else {
            console.warn("Browser instance was not available to close.");
        }
    } catch (error) {
        console.error(`Error while closing browser: ${error}`);
        throw error;
    }
  }

  /**
   * Saves a screenshot of the current screen state.
   * @param {Object} obj - Screenshot options (e.g., {path: 'screenshot.png'}).
   */
  async screenshot(obj) {
    try {
        await this.page.screenshot(obj);
        console.log(`Screenshot saved to: ${obj.path}`);
    } catch (error) {
        console.error(`Error while taking screenshot: ${error}`);
        throw error;
    }
  }

  /**
   * Logs out of the current Snapchat account.
   */
  async logout() {
    try {
        await this.page.waitForSelector("#downshift-1-toggle-button", { visible: true, timeout: 10000 }); // Profile icon/dropdown
        await this.page.click("#downshift-1-toggle-button");
        await delay(1000); // Short delay for dropdown to appear
        await this.page.waitForSelector("#downshift-1-item-9", { visible: true, timeout: 5000 }); // Logout option
        await this.page.click("#downshift-1-item-9");
        console.log("Logged Out");
        await delay(12000); // Allow time for logout process
    } catch (error) {
        console.error(`Error during logout: ${error}`);
        throw error;
    }
  }

  /**
   * Pauses the script for a specified duration.
   * @param {number} time - Duration in milliseconds to wait.
   */
  async wait(time) {
    return delay(time); // Re-use the existing delay function
  }
}

module.exports = SnapBot;
