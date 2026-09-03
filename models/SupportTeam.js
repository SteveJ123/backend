import mongoose from "mongoose";

const SupportTeamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: "https://via.placeholder.com/150",
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    available: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const SupportTeam = mongoose.model("SupportTeam", SupportTeamSchema);
export default SupportTeam;
