import mongoose from "mongoose";

const personalDetailsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // References your User model
      required: [true, "User ID is required"],
      unique: true, // Ensures one personalDetails record per user
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    aboutYou: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },
    birthday: {
      type: String, // Storing as YYYY-MM-DD string format
      default: "",
    },
    profileImage: {
      type: String, // Stores URL or path (e.g., 'https://cloudinary.com/...' or '/uploads/avatar.jpg')
      default: "",
    },
  },
  { timestamps: true },
);

export default mongoose.model("PersonalDetails", personalDetailsSchema);
