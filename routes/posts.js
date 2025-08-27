const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware/auth");
const { Post, SocialAccount, PostAccount } = require("../models");
const { publishToSocial } = require("../config/passport"); // tu helper de publicación

//multer para manejo de archivos
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, "")}`),
});

const upload = multer({ storage });

// Formulario para crear publicación
router.get("/new", ensureAuthenticated, async (req, res) => {
  const accounts = await SocialAccount.findAll({ where: { userId: req.user.id } });
  res.render("posts/new", { accounts });
});

// Guardar publicación
router.post("/", ensureAuthenticated, upload.single("image"), async (req, res) => {
  try {
    const { content, scheduledAt, accounts } = req.body;
    const now = new Date();
    const status = !scheduledAt || new Date(scheduledAt) <= now ? "published" : "pending";
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const post = await Post.create({
      userId: req.user.id,
      content,
      imageUrl: imagePath,
      scheduledAt: scheduledAt || null,
      status,
    });

    // Asociar cuentas sociales
    if (accounts && accounts.length > 0) {
      for (let accId of accounts) {
        await PostAccount.create({ postId: post.id, accountId: accId });

        // Publicar inmediatamente si el post es "published"
        if (status === "published") {
          try {
            await publishToSocial(accId, "twitter", content, imagePath); // accId es el accountId
            console.log(`Publicado correctamente en Twitter (accountId: ${accId})`);
          } catch (err) {
            console.error(`Error publicando en Twitter (accountId: ${accId}):`, err);
            // Opcional: actualizar estado a "failed" si falla
            await post.update({ status: "failed" });
          }
        }
      }
    }

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Error creando post:", err);
    res.redirect("/posts/new");
  }
});

module.exports = router;
