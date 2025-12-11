export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    try {
        const body = req.body || {};

        console.log("🔁 MIDTRANS RECURRING CALLBACK RECEIVED");
        console.log(JSON.stringify(body, null, 2));

        const {
            id,
            token,
            status,
            schedule,
            payment_type,
            amount,
            customer_details,
            metadata
        } = body;

        if (!id || !status) {
            console.error("❌ Invalid recurring payload, missing id or status");
            return res.status(400).json({ ok: false, message: "Invalid recurring payload" });
        }

        // Logging details
        console.log("🧾 Recurring ID            :", id);
        console.log("🔑 Token                  :", token);
        console.log("📌 Status                 :", status);
        console.log("💳 Payment Type           :", payment_type);
        console.log("💰 Amount                 :", amount);
        console.log("👤 Customer               :", customer_details?.first_name);
        console.log("🗓️ Start Time             :", schedule?.start_time);
        console.log("⏭️ Next Execution         :", schedule?.next_execution_at);
        console.log("📅 Interval               :", schedule?.interval, schedule?.interval_unit);
        console.log("📝 Metadata               :", metadata);

        // 🚫 NO PROCESSING — JUST LOGGING
        console.log("🔍 Recurring callback logged. No further action taken.");

        return res.status(200).json({
            ok: true,
            message: "Recurring callback logged",
            recurringId: id
        });

    } catch (err) {
        console.error("❌ ERROR HANDLING RECURRING CALLBACK:", err);
        return res.status(500).json({ ok: false, message: "Internal server error", error: String(err) });
    }
}
