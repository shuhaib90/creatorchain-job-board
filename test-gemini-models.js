import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCQ03BwZHXIQnxXQjdM3CZubhx4zKNrFkA';

async function test() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const data = await response.json();
        console.log("Models:", data.models?.map(m => m.name));
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
