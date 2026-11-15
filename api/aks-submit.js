/**
 * Vercel Serverless Function - Replaces aks-submit.php
 * Handles Contact Form, Review Form, and Newsletter Submissions.
 * 
 * Works out-of-the-box:
 * - Validates submissions and checks honeypot
 * - Verifies Google reCAPTCHA
 * - Logs all submissions to Vercel Runtime Logs (viewable in Vercel dashboard)
 * - If RESEND_API_KEY is added to Vercel Environment Variables, emails are sent to alkarwantanks@gmail.com
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const body = req.body || {};
  const formType = (body.form_type || 'contact').trim();

  // Honeypot anti-spam check
  if (body.website && body.website.trim() !== '') {
    return res.redirect(303, '/thank-you/');
  }

  // Google reCAPTCHA v3 verification
  const recaptchaToken = body['g-recaptcha-response'];
  const recaptchaSecret = process.env.RECAPTCHA_SECRET; // set in Vercel → Settings → Environment Variables

  if (recaptchaToken && recaptchaSecret) {
    try {
      const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: recaptchaSecret,
          response: recaptchaToken,
          remoteip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
        })
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success || (verifyData.score && verifyData.score < 0.5)) {
        return res.redirect(303, '/contact-us/?error=' + encodeURIComponent('reCAPTCHA verification failed. Please try again.'));
      }
    } catch (err) {
      console.error('[reCAPTCHA Error]', err);
    }
  }

  const toEmail = process.env.TO_EMAIL || 'alkarwantanks@gmail.com';
  let subject = '';
  let content = '';

  if (formType === 'contact') {
    const { name = '', email = '', phone = '', service = '', message = '' } = body;
    if (!name || !email || !message) {
      return res.redirect(303, '/contact-us/?error=' + encodeURIComponent('Please fill in all required fields.'));
    }
    subject = `New Contact Form Submission from ${name}`;
    content = `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nService Interested In: ${service}\n\nMessage:\n${message}`;
  } else if (formType === 'review') {
    const { name = '', company = '', rating = '', message = '', email = '' } = body;
    if (!name || !message) {
      return res.redirect(303, '/reviews/?error=' + encodeURIComponent('Name and message are required.'));
    }
    subject = `New Customer Review from ${name} (${rating}/5 Stars)`;
    content = `Name: ${name}\nCompany: ${company}\nEmail: ${email}\nRating: ${rating}/5 Stars\n\nReview:\n${message}`;
  } else if (formType === 'newsletter') {
    const { email = '' } = body;
    if (!email) {
      return res.redirect(303, '/?error=invalid-email');
    }
    subject = `New Newsletter Subscription: ${email}`;
    content = `Email: ${email}\nSubscription requested on: ${new Date().toISOString()}`;
  } else {
    subject = `Form Submission (${formType})`;
    content = JSON.stringify(body, null, 2);
  }

  // Always log to Vercel console for audit and viewing in Vercel dashboard
  console.log(`[Form Submission] ${subject}:\n${content}`);

  // Optional: Send email via Resend API if API key is provided
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL || 'Al Karwan Solution <notifications@resend.dev>',
          to: [toEmail],
          subject: subject,
          text: content
        })
      });
      console.log('[Email Sent Successfully via Resend]');
    } catch (err) {
      console.error('[Failed to send email via Resend]', err);
    }
  }

  // Redirect to Thank You page
  return res.redirect(303, '/thank-you/');
}

