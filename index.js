const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'ANEM Renewal API is running' });
});

// Renewal endpoint
app.post('/renew', async (req, res) => {
  const { nin, anemId } = req.body;
  
  if (!nin || !anemId) {
    return res.status(400).json({ error: 'nin and anemId are required' });
  }

  console.log(`[${new Date().toISOString()}] Starting renewal for NIN: ${nin}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Set user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to the page
    console.log('   Navigating to ANEM...');
    await page.goto('https://wassitonline.anem.dz/postulation/prolongationDemande', {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    await delay(4000);

    // Fill NIN using page.type (like successful script)
    console.log('   Filling NIN...');
    await page.waitForSelector('#nin', { timeout: 10000 });
    await page.click('#nin');
    await page.type('#nin', nin, { delay: 20 });
    console.log('   ✓ NIN filled');

    await delay(500);

    // Fill ANEM ID
    console.log('   Filling ANEM ID...');
    await page.waitForSelector('#numeroWassit', { timeout: 10000 });
    await page.click('#numeroWassit');
    await page.type('#numeroWassit', anemId, { delay: 20 });
    console.log('   ✓ ANEM ID filled');

    await delay(500);

    // Check checkbox using direct click (like successful script)
    console.log('   Checking checkbox...');
    
    // Method 1: Click on the label/wrapper
    try {
      await page.click('.ant-checkbox-wrapper');
      console.log('   ✓ Clicked checkbox wrapper');
    } catch (e) {
      console.log('   Wrapper click failed, trying label...');
      try {
        await page.click('label[for="acceptTerms"]');
      } catch (e2) {
        // Try clicking the checkbox directly
        await page.click('#acceptTerms');
      }
    }
    
    await delay(500);
    
    // Verify checkbox state
    let isChecked = await page.evaluate(() => {
      const cb = document.getElementById('acceptTerms');
      return cb?.checked;
    });
    console.log('   Checkbox state after click:', isChecked);
    
    // If not checked, try alternative methods
    if (!isChecked) {
      console.log('   Trying alternative checkbox methods...');
      await page.evaluate(() => {
        const checkbox = document.getElementById('acceptTerms');
        if (checkbox) {
          // Force the checked state
          checkbox.checked = true;
          
          // Trigger all possible events
          ['click', 'change', 'input'].forEach(eventType => {
            checkbox.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
          
          // Try React synthetic event
          const reactKey = Object.keys(checkbox).find(k => k.startsWith('__reactProps'));
          if (reactKey && checkbox[reactKey]?.onChange) {
            checkbox[reactKey].onChange({ target: { checked: true } });
          }
        }
      });
      
      isChecked = await page.evaluate(() => document.getElementById('acceptTerms')?.checked);
      console.log('   Checkbox state after force:', isChecked);
    }

    await delay(1000);

    // Wait for button to be enabled
    console.log('   Waiting for button...');
    let attempts = 0;
    let btnClicked = false;
    
    while (attempts < 5 && !btnClicked) {
      const buttonState = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.includes('Prolonger'));
        return btn ? { disabled: btn.disabled, text: btn.textContent } : null;
      });
      
      console.log('   Button:', buttonState?.disabled ? 'disabled' : 'enabled');
      
      if (buttonState && !buttonState.disabled) {
        // Use page.click for the button
        try {
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent.includes('Prolonger'));
            if (btn) btn.click();
          });
          btnClicked = true;
        } catch (e) {
          console.log('   Button click error:', e.message);
        }
        break;
      }
      
      // Retry checkbox
      console.log('   Retrying checkbox... attempt', attempts + 1);
      try {
        await page.click('.ant-checkbox-wrapper');
      } catch (e) {
        await page.evaluate(() => {
          const cb = document.getElementById('acceptTerms');
          const wrapper = cb?.closest('.ant-checkbox-wrapper') || cb?.parentElement;
          if (wrapper) wrapper.click();
        });
      }
      
      await delay(1000);
      attempts++;
    }
    
    console.log('   ✓ Submit button clicked:', btnClicked);

    // Wait for result
    console.log('   Waiting for result...');
    await delay(5000);

    // Check for success
    const resultText = await page.evaluate(() => document.body.innerText);
    console.log('   Page text (first 500 chars):', resultText.substring(0, 500));
    
    const isSuccess = resultText.includes('succès') || 
                     resultText.includes('prolongée') ||
                     resultText.includes('Demande prolongée') ||
                     resultText.includes('validée');

    // Check for error messages
    const hasError = resultText.includes('erreur') || 
                    resultText.includes('invalide') ||
                    resultText.includes('incorrect') ||
                    resultText.includes('existe pas');

    if (hasError) {
      console.log('   ❌ Error detected on page');
    }

    if (!isSuccess) {
      console.log('   ❌ Renewal failed - success text not found');
      
      // Take screenshot for debugging
      const debugScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
      await browser.close();
      
      return res.status(400).json({ 
        success: false, 
        error: 'Renewal failed - check your credentials or try again later',
        screenshot: debugScreenshot.toString('base64')
      });
    }

    console.log('   ✅ Renewal successful! Looking for PDF...');
    await delay(2000);

    // Click download button
    const downloadClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const downloadBtn = buttons.find(el => {
        const text = (el.textContent || el.innerText || '').toLowerCase();
        return text.includes('télécharger') || text.includes('attestation');
      });
      
      if (downloadBtn) {
        downloadBtn.click();
        return true;
      }
      return false;
    });

    if (!downloadClicked) {
      console.log('   ⚠️ Download button not found');
    }

    await delay(3000);

    // Try to capture PDF from network
    let pdfBase64 = null;
    
    // Take screenshot as fallback
    const screenshot = await page.screenshot({ 
      type: 'jpeg', 
      quality: 90,
      fullPage: true 
    });
    const screenshotBase64 = screenshot.toString('base64');

    await browser.close();

    console.log('   ✅ Done!');

    res.json({
      success: true,
      message: 'Renewal completed successfully',
      pdf: pdfBase64,
      screenshot: screenshotBase64,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error:', error.message);
    if (browser) await browser.close();
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ANEM Renewal API running on port ${PORT}`);
});
