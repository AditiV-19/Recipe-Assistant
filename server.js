require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());
app.use(cors());

// Variables from .env
const mongoURI = process.env.MONGO_URI;
const apiKey = process.env.GEMINI_API_KEY;
const port = process.env.PORT || 5000;

// 1. Database Connection
mongoose.connect(mongoURI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.log("❌ Connection Error:", err));

// 2. Recipe Schema (Crucial: Keep this so the code knows what a Recipe is)
const recipeSchema = new mongoose.Schema({
    RecipeName: String,
    TranslatedRecipeName: String,
    Ingredients: String,
    TranslatedIngredients: String,
    TotalTimeInMins: Number,
    Cuisine: String,
    Diet: String,
    TranslatedInstructions: String,
    Servings: Number
});

const Recipe = mongoose.model('Recipe', recipeSchema);

// 3. AI Setup
const ai = new GoogleGenAI({
    apiKey: apiKey
});

// --- API ROUTES ---

// Search Route
app.post('/find-recipes', async (req, res) => {
    const userIngredients = req.body.ingredients.map(i => i.toLowerCase().trim());
    try {
        const query = {
            $or: userIngredients.map(ing => ({
                TranslatedIngredients: { $regex: ing, $options: 'i' }
            }))
        };
        let matches = await Recipe.find(query).limit(20).lean();

        matches = matches.map(recipe => {
            const recipeIngString = (recipe.TranslatedIngredients || "").toLowerCase();
            const recipeIngList = recipeIngString.split(',').map(i => i.trim());
            const matchedItems = userIngredients.filter(ui => recipeIngString.includes(ui));
            const missingItems = recipeIngList.filter(ri => 
                !userIngredients.some(ui => ri.includes(ui))
            );
            return { 
                ...recipe, 
                matchCount: matchedItems.length,
                missingItems: missingItems.slice(0, 5) 
            };
        });

        matches.sort((a, b) => b.matchCount - a.matchCount);
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AI Analyze Route
app.post('/ai-analyze', async (req, res) => {
    try {
        const { recipeName, missingItems, userPantry } = req.body;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // gemini-1.5-flash is currently the most stable for this SDK
            contents: [{
                role: "user",
                parts: [{ text: `I have ${userPantry.join(", ")}. I'm making ${recipeName} but missing ${missingItems.join(", ")}. Suggest 1-2 swaps.` }]
            }]
        });

        res.json({ advice: response.text });
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ advice: "Chef AI is offline. Try using lemon for vinegar!" });
    }
});

// ONLY ONE app.listen at the very end
app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));