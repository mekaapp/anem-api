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

    // Navigate to the page
    console.log('   Navigating to ANEM...');
    await page.goto('https://wassitonline.anem.dz/postulation/prolongationDemande', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await delay(3000);

    // Fill NIN
    console.log('   Filling NIN...');
    await page.evaluate((ninValue) => {
      const ninInput = document.getElementById('nin') || document.querySelector('input[name="nin"]');
      if (ninInput) {
        ninInput.focus();
        ninInput.value = ninValue;
        ninInput.dispatchEvent(new Event('input', { bubbles: true }));
        ninInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, nin);

    await delay(500);

    // Fill ANEM ID
    console.log('   Filling ANEM ID...');
    await page.evaluate((anemValue) => {
      const anemInput = document.getElementById('numeroWassit') || 
                       document.getElementById('anem_id') || 
                       document.querySelector('input[name="numeroWassit"]');
      if (anemInput) {
        anemInput.focus();
        anemInput.value = anemValue;
        anemInput.dispatchEvent(new Event('input', { bubbles: true }));
        anemInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, anemId);

    await delay(1000);

    // Check checkbox
    console.log('   Checking checkbox...');
    await page.evaluate(() => {
      const checkbox = document.getElementById('acceptTerms') || document.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) {
        // Try clicking the wrapper first (Ant Design)
        const wrapper = checkbox.closest('.ant-checkbox-wrapper') || checkbox.closest('label');
        if (wrapper) {
          wrapper.click();
        }
        
        // Force check
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Try React onChange
        const reactKey = Object.keys(checkbox).find(k => k.startsWith('__reactProps'));
        if (reactKey && checkbox[reactKey]?.onChange) {
          checkbox[reactKey].onChange({ target: { checked: true } });
        }
      }
    });

    await delay(1000);

    // Click submit button
    console.log('   Clicking submit button...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Prolonger'));
      if (btn && !btn.disabled) {
        btn.click();
      }
    });

    // Wait for result
    console.log('   Waiting for result...');
    await delay(5000);

    // Check for success
    const resultText = await page.evaluate(() => document.body.innerText);
    const isSuccess = resultText.includes('succès') || 
                     resultText.includes('prolongée') ||
                     resultText.includes('Demande prolongée');

    if (!isSuccess) {
      console.log('   ❌ Renewal failed');
      await browser.close();
      return res.status(400).json({ 
        success: false, 
        error: 'Renewal failed - check your credentials or try again later' 
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
