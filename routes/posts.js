const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware/auth");
const { Post, SocialAccount, PostAccount } = require("../models");
const { publishToSocial } = require("../config/passport"); // tu helper de publicación

// Formulario para crear publicación
router.get("/new", ensureAuthenticated, async (req, res) => {
  const accounts = await SocialAccount.findAll({ where: { userId: req.user.id } });
  res.render("posts/new", { accounts });
});

// Guardar publicación
router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    const { content, scheduledAt, accounts } = req.body;
    const now = new Date();
    const status = !scheduledAt || new Date(scheduledAt) <= now ? "published" : "pending";

    const post = await Post.create({
      userId: req.user.id,
      content,
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
            await publishToSocial(accId, "twitter", content); // accId es el accountId
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
