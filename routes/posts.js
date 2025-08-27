const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware/auth");
const { Post, SocialAccount, PostAccount } = require("../models");
const { publishToSocial } = require("../config/passport"); // tu helper de publicación

// Formulario para crear publicación
router.get("/new", ensureAuthenticated, async (req, res) => {
  const accounts = await SocialAccount.findAll({
    where: { userId: req.user.id },
  });
  res.render("posts/new", { accounts });
});

// Guardar publicación
router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    let { content, scheduledAt, accounts } = req.body;
    const now = new Date();

    // Asegurarse que accounts sea un array
    if (!Array.isArray(accounts)) {
      accounts = accounts ? [accounts] : [];
    }

    const status =
      !scheduledAt || new Date(scheduledAt) <= now ? "published" : "pending";

    console.log("Contenido de la publicación:", req.body);

    // Crear el post
    const post = await Post.create({
      userId: req.user.id,
      content,
      scheduledAt: scheduledAt || null,
      status,
    });

    // Obtener todas las cuentas sociales del usuario si no vienen explícitas
    const userAccounts =
      accounts.length > 0
        ? await SocialAccount.findAll({
            where: { id: accounts }, // cuentas seleccionadas
          })
        : await SocialAccount.findAll({
            where: { userId: req.user.id }, // todas las cuentas del usuario
          });

    // Asociar cuentas y publicar si corresponde
    for (let socialAccount of userAccounts) {
      await PostAccount.create({
        postId: post.id,
        accountId: socialAccount.userId,
      });

      if (status === "published") {
        try {
          await publishToSocial(
            socialAccount.userId,
            socialAccount.provider,
            content
          );
          console.log(
            `Publicado correctamente en ${socialAccount.provider} (accountId: ${socialAccount.id})`
          );
        } catch (err) {
          console.error(
            `Error publicando en la red (accountId: ${socialAccount.id}):`,
            err
          );
          await post.update({ status: "failed" });
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
