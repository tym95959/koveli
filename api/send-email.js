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
        const { to, subject, message, name, orderNumber, total } = req.body;

        // Validate
        if (!to || !subject || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: to, subject, message' 
            });
        }

        // Build email HTML
        const html = `
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
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🛍️ StockRoomMV</h1>
                    </div>
                    <div class="content">
                        <h2>${subject}</h2>
                        ${name ? `<p><strong>Hi ${name},</strong></p>` : ''}
                        <p>${message}</p>
                        ${orderNumber ? `
                            <div class="order-details">
                                <p><strong>Order Number:</strong> #${orderNumber}</p>
                                ${total ? `<p><strong>Total:</strong> ރ${total}</p>` : ''}
                            </div>
                        ` : ''}
                        <div style="text-align: center; margin: 20px 0;">
                            <a href="${process.env.SITE_URL || 'https://stockroommv.vercel.app'}" class="button">Visit Shop</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>StockRoomMV - Quality • Trust • Value</p>
                        <p>© ${new Date().getFullYear()} StockRoomMV. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Send email
        const mailOptions = {
            from: `"StockRoomMV" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: html
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
        service: 'StockRoomMV Notification Service',
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
