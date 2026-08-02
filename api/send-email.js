const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Email configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// ============================================================
// ===== SEND EMAIL API =====
// ============================================================

app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, message, text, name, orderNumber, total } = req.body;

        // Use either message or text field
        const emailMessage = message || text || 'No message provided';

        // Validate
        if (!to || !subject) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: to, subject' 
            });
        }

        // Check if this is a duty change email (plain text) or HTML email
        const isDutyChange = emailMessage.includes('DUTY CHANGE') || emailMessage.includes('Swap Date');

        let html;
        if (isDutyChange) {
            // For duty change emails - plain text format (preserve formatting)
            html = emailMessage.replace(/\n/g, '<br>');
        } else {
            // For other emails - HTML format
            html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { background: linear-gradient(135deg, #ffd700, #f0a500); padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                        .header h1 { color: #1a1a2e; margin: 0; }
                        .content { padding: 20px; }
                        .footer { text-align: center; color: #888; font-size: 0.8em; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
                        .button { background: #ffd700; color: #1a1a2e; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
                        .order-details { background: #f8f8f8; padding: 15px; border-radius: 5px; margin: 15px 0; }
                        .duty-box { font-family: monospace; white-space: pre-wrap; background: #f8f8f8; padding: 15px; border-radius: 5px; border-left: 4px solid #ffd700; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🔄 Duty Change System</h1>
                        </div>
                        <div class="content">
                            <h2>${subject}</h2>
                            ${name ? `<p><strong>Hi ${name},</strong></p>` : ''}
                            <div class="duty-box">${emailMessage.replace(/\n/g, '<br>')}</div>
                        </div>
                        <div class="footer">
                            <p>Duty Change System - Automated Notification</p>
                            <p>© ${new Date().getFullYear()} All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
        }

        // Send email
        const mailOptions = {
            from: `"Duty Change System" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: html,
            text: emailMessage // Plain text fallback
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('📧 Email sent:', info.messageId);

        res.json({
            success: true,
            message: 'Email sent successfully!',
            messageId: info.messageId
        });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send email'
        });
    }
});

// ============================================================
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'Duty Change Notification Service',
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
