import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
    },
    imageUrl: {
      type: String,
      required: [true, "Event image URL is required"],
    },
    language: {
      type: String,
      enum: ["English", "Telugu"], // English and Telugu support
      required: true,
      default: "English",
    },
  },
  { timestamps: true },
);

const Event = mongoose.model("Event", eventSchema);
export default Event;
