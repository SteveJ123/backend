import mongoose from "mongoose";

const nutritionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: {
    type: String,
    enum: ["nutritiousFood", "healthyDrink"],
    required: true,
  },
  language: { type: String, enum: ["English", "Telugu"], default: "Telugu" },
  imageUrl: { type: String, required: true },
  ingredients: { type: String, required: true },
  description: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Nutrition", nutritionSchema);
