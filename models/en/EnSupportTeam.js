import mongoose from "mongoose";

const EnSupportTeamSchema = new mongoose.Schema(
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

const EnSupportTeam = mongoose.model("EnSupportTeam", EnSupportTeamSchema);
export default EnSupportTeam;
