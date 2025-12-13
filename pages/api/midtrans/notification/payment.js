import crypto from "crypto";
import logger from "../../../../lib/logger";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        logger.warn("Method not allowed: " + req.method);
        return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    try {
        const body = req.body || {};

        logger.info("🔔 MIDTRANS NOTIFICATION RECEIVED");
        logger.info(JSON.stringify(body, null, 2));

        const {
            order_id,
            transaction_id,
            transaction_status,
            status_code,
            gross_amount,
            signature_key,
            payment_type
        } = body;

        if (!order_id || !transaction_status) {
            logger.error("Invalid Midtrans payload");
            return res.status(400).json({ ok: false, message: "Invalid Midtrans payload" });
        }

        const serverKey = process.env.MIDTRANS_SERVER_KEY;

        // const expectedSignature = crypto
        //     .createHash("sha512")
        //     .update(order_id + status_code + gross_amount + serverKey)
        //     .digest("hex");

        // if (expectedSignature !== signature_key) {
        //     logger.error("❌ Invalid Midtrans signature!");
        //     return res.status(401).json({ ok: false, message: "Invalid signature key" });
        // }

        // logger.info("✔️ Valid Midtrans signature");

        let PaymentCode = "OTHERS";

        if (payment_type.includes("gopay")) PaymentCode = "GOPAY";
        else if (payment_type.includes("qris")) PaymentCode = "QRISOTHERS";
        else if (payment_type.includes("credit_card")) PaymentCode = "CC";
        else PaymentCode = payment_type.toUpperCase();

        logger.info(`💳 PaymentCode: ${PaymentCode}`);

        const paidStatuses = ["capture", "settlement", "success"];

        let order_code
        if (paidStatuses.includes(transaction_status.toLowerCase())) {
            logger.info("💰 Payment completed, calling do-payment-trans-id...");
            const resp = await fetch(`${process.env.NEXT_PUBLIC_URL_DEV}/api/order/do-payment-trans-id`, {
            // const resp = await fetch(`${process.env.NEXT_PUBLIC_DOMAIN}/api/order/do-payment-trans-id`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transactionId: order_id,
                    payment: PaymentCode,
                    reference: transaction_id
                })
            });

            const result = await resp.json().catch(() => null);

            logger.info("➡️ do-payment-trans-id result: " + JSON.stringify(result));
            order_code = result.order_code;

            if (!resp.ok) {
                logger.error("❌ Backend failed: " + JSON.stringify(result));
            }
        }

        return res.status(200).json({
            ok: true,
            message: "Notification processed",
            orderId: order_id,
            transactionId: transaction_id,
            order_code: order_code
        });

    } catch (err) {
        logger.error("ERROR HANDLING MIDTRANS NOTIF: " + err);
        return res.status(500).json({ ok: false, message: "Internal server error", error: String(err) });
    }
}
