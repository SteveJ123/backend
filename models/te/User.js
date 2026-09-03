import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    courseType: {
      type: String,
      enum: ["Face Yoga", "Face Yoga + Raj Yoga"],
      required: true,
    },
    language: {
      type: String,
      enum: ["English", "Telugu"],
      required: true,
    },
    points: { type: Number, default: 0 },
    completedPracticeDates: [{ type: String }], // Format: 'YYYY-MM-DD
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", UserSchema, "register");

export default User;
