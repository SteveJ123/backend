import express from "express";
import fs from "fs";
import path from "path";
import Course from "../models/Course.js";
import upload from "../middleware/uploadLecture.js";

const router = express.Router();

// Helper to extract & normalize language from query, body, or headers
const extractLanguage = (req) => {
  const input =
    req.query.language ||
    req.body.language ||
    req.headers["x-language"] ||
    "English";

  const lower = String(input).trim().toLowerCase();
  if (lower === "te" || lower === "telugu") return "Telugu";
  return "English";
};

// Ensure upload directory exists
if (!fs.existsSync("./uploads/videos")) {
  fs.mkdirSync("./uploads/videos", { recursive: true });
}

// -----------------------------------------------------------------------------
// GET: Fetch all courses by language (/api/course?language=Telugu)
// -----------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { language } = req.body;
    const courses = await Course.find({ language });

    return res.status(200).json({ success: true, data: courses });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// GET: Fetch single course by ID & language (/api/course/:id?language=English)
// -----------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    console.log("req params", req.params);
    console.log("req body", req.body);
    const language = extractLanguage(req);
    const course = await Course.findOne({ _id: req.params.id, language });

    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    return res.status(200).json({ success: true, data: course });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// POST: Create a new course (/api/course)
// -----------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const language = extractLanguage(req);
    const { title, description, instructor, thumbnail, isPaid, isNewCourse } =
      req.body;

    const course = await Course.create({
      title,
      description,
      instructor,
      thumbnail,
      isPaid,
      isNewCourse,
      language,
    });

    return res.status(201).json({ success: true, data: course });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// POST: Add video lecture (/api/course/:id/lectures?language=Telugu)
// -----------------------------------------------------------------------------
router.post("/:id/lectures", upload.single("video"), async (req, res) => {
  try {
    const language = extractLanguage(req);
    const { title } = req.body;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No video file provided" });
    }

    const videoUrl = `/uploads/videos/${req.file.filename}`;

    const updatedCourse = await Course.findOneAndUpdate(
      { _id: req.params.id, language },
      { $push: { lectures: { title, videoUrl } } },
      { returnDocument: "after", runValidators: true },
    );

    if (!updatedCourse) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Lecture uploaded successfully",
      data: updatedCourse,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// PUT: Update course details (/api/course/:id?language=Telugu)
// -----------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const language = extractLanguage(req);

    const updatedCourse = await Course.findOneAndUpdate(
      { _id: req.params.id, language },
      { $set: { ...req.body, language } },
      { returnDocument: "after", runValidators: true },
    );

    if (!updatedCourse) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: updatedCourse,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// DELETE: Delete course (/api/course/:id?language=Telugu)
// -----------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const language = extractLanguage(req);
    const course = await Course.findOneAndDelete({
      _id: req.params.id,
      language,
    });

    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    // Clean up physical video files
    if (course.lectures?.length > 0) {
      course.lectures.forEach((lecture) => {
        const filename = lecture.videoUrl.split("/uploads/videos/").pop();
        if (filename) {
          const filePath = path.join(
            process.cwd(),
            "uploads",
            "videos",
            filename,
          );
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      });
    }

    return res
      .status(200)
      .json({ success: true, message: "Course deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// DELETE: Delete single lecture (/api/course/:id/lectures/:lectureId?language=Telugu)
// -----------------------------------------------------------------------------
// router.delete("/:id/lectures/:lectureId", async (req, res) => {
//   try {
//     const language = extractLanguage(req);
//     const { id, lectureId } = req.params;

//     const course = await Course.findOne({ _id: id, language });
//     if (!course) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Course not found" });
//     }

//     const lecture = course.lectures.id(lectureId);
//     if (lecture) {
//       const filename = lecture.videoUrl.split("/uploads/videos/").pop();
//       if (filename) {
//         const filePath = path.join(
//           process.cwd(),
//           "uploads",
//           "videos",
//           filename,
//         );
//         if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//       }
//     }

//     const updatedCourse = await Course.findOneAndUpdate(
//       { _id: id, language },
//       { $pull: { lectures: { _id: lectureId } } },
//       { returnDocument: "after" },
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Lecture deleted successfully",
//       data: updatedCourse,
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// -----------------------------------------------------------------------------
// PUT: Edit an existing lecture (Title and optional replacement video)
// -----------------------------------------------------------------------------
router.put(
  "/:id/lectures/:lectureId",
  upload.single("video"),
  async (req, res) => {
    try {
      const language = extractLanguage(req);
      const { id, lectureId } = req.params;
      const { title } = req.body;

      const course = await Course.findOne({ _id: id, language });
      if (!course) {
        return res
          .status(404)
          .json({ success: false, message: "Course not found" });
      }

      const lecture = course.lectures.id(lectureId);
      if (!lecture) {
        return res
          .status(404)
          .json({ success: false, message: "Lecture not found" });
      }

      // Build subdocument updates
      const updateData = {};
      if (title) updateData["lectures.$.title"] = title;

      // Handle new video file replacement if uploaded
      if (req.file) {
        // Clean up old file from disk
        if (lecture.videoUrl) {
          const oldFilename = lecture.videoUrl.split("/uploads/videos/").pop();
          if (oldFilename) {
            const oldFilePath = path.join(
              process.cwd(),
              "uploads",
              "videos",
              oldFilename,
            );
            if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
          }
        }
        updateData["lectures.$.videoUrl"] =
          `/uploads/videos/${req.file.filename}`;
      }

      const updatedCourse = await Course.findOneAndUpdate(
        { _id: id, "lectures._id": lectureId, language },
        { $set: updateData },
        { returnDocument: "after", runValidators: true },
      );

      return res.status(200).json({
        success: true,
        message: "Lecture updated successfully",
        data: updatedCourse,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

// -----------------------------------------------------------------------------
// DELETE: Remove a specific lecture from a course
// -----------------------------------------------------------------------------
router.delete("/:id/lectures/:lectureId", async (req, res) => {
  try {
    const language = extractLanguage(req);
    const { id, lectureId } = req.params;

    const course = await Course.findOne({ _id: id, language });
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    const lecture = course.lectures.id(lectureId);
    if (lecture && lecture.videoUrl) {
      const filename = lecture.videoUrl.split("/uploads/videos/").pop();
      if (filename) {
        const filePath = path.join(
          process.cwd(),
          "uploads",
          "videos",
          filename,
        );
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    const updatedCourse = await Course.findOneAndUpdate(
      { _id: id, language },
      { $pull: { lectures: { _id: lectureId } } },
      { returnDocument: "after" },
    );

    return res.status(200).json({
      success: true,
      message: "Lecture deleted successfully",
      data: updatedCourse,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
