import mongoose from "mongoose";

const personalDetailsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      // REMOVED: unique: true
    },
    name: { type: String, required: true, trim: true },
    aboutYou: { type: String, default: "" },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },
    birthday: { type: String, default: "" },
    profileImage: { type: String, default: "" },
    language: { type: String, required: true, enum: ["English", "Telugu"] },
  },
  { timestamps: true },
);

// Compound Index: Ensures 1 record per user per language
personalDetailsSchema.index({ userId: 1, language: 1 }, { unique: true });

export default mongoose.models.PersonalDetails ||
  mongoose.model("PersonalDetails", personalDetailsSchema);
