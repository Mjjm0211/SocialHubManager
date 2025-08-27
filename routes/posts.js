const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware/auth");
const { Post, SocialAccount, PostAccount } = require("../models");
const { publishToSocial } = require("../config/passport");

const multer = require("multer");
const upload = multer(); // Aquí puedes luego configurar almacenamiento si lo deseas

// Formulario para crear publicación
router.get("/new", ensureAuthenticated, async (req, res) => {
  const accounts = await SocialAccount.findAll({
    where: { userId: req.user.id },
  });
  res.render("posts/new", { accounts });
});

// Guardar publicación
router.post("/", ensureAuthenticated, upload.none(), async (req, res) => {
  try {
    console.log("Body recibido:", req.body);

    const { content, scheduledAt } = req.body;
    let { accounts } = req.body;

    // Si se seleccionó solo una cuenta, `accounts` puede venir como string, no como array
    if (typeof accounts === "string") {
      accounts = [accounts];
    }

    const now = new Date();
    const status =
      !scheduledAt || new Date(scheduledAt) <= now ? "published" : "pending";

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

        if (status === "published") {
          try {
            const socialAccount = await SocialAccount.findByPk(accId);
            if (!socialAccount) throw new Error("Cuenta social no encontrada");

            await publishToSocial(accId, socialAccount.provider, content);
            console.log(
              `Publicado correctamente en ${socialAccount.provider} (accountId: ${accId})`
            );
          } catch (err) {
            console.error(
              `Error publicando en la red (accountId: ${accId}):`,
              err
            );
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
