import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    productUrl: { type: String, required: true },
    imageUrl: { type: String, required: true },
    language: {
      type: String,
      required: true,
      enum: ["English", "Telugu"],
      index: true,
    },
  },
  { timestamps: true },
);

export default mongoose.models.Product ||
  mongoose.model("Product", productSchema);
