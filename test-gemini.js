import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCQ03BwZHXIQnxXQjdM3CZubhx4zKNrFkA';

async function test() {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // The user asked for "Gemini 3 Flash Live", but standard is gemini-1.5-flash
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
        const result = await model.generateContent("Hello");
        console.log("Success:", result.response.text());
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
