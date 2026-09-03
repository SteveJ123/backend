import mongoose from "mongoose";

const EnproductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    productUrl: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true, trim: true },
    // price: { type: String, required: false, trim: true },
    // storeName: { type: String, default: "Amazon", trim: true },
  },
  { timestamps: true },
);

export default mongoose.models.EnProduct ||
  mongoose.model("EnProduct", EnproductSchema);
