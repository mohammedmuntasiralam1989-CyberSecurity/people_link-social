// routes/posts.js (Extended)
// Share post
router.post('/:id/share', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if already shared
    const alreadyShared = post.shares.find(
      share => share.user.toString() === req.user.id
    );

    if (alreadyShared) {
      return res.status(400).json({ message: 'Post already shared' });
    }

    // Add share
    post.shares.push({ user: req.user.id });
    await post.save();

    // Create new post for share (optional)
    const sharePost = new Post({
      user: req.user.id,
      content: req.body.caption || '',
      sharedPost: post._id,
      isShare: true
    });

    await sharePost.save();

    // Create notification
    await createNotification({
      type: 'share',
      fromUser: req.user.id,
      toUser: post.user,
      post: post._id,
      message: `${req.user.name} shared your post`
    });

    res.json({ message: 'Post shared successfully', sharesCount: post.shares.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add comment with mentions
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Extract mentions from content
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      const username = match[1];
      const user = await User.findOne({ username });
      if (user) {
        mentions.push(user._id);
      }
    }

    const comment = {
      user: req.user.id,
      content,
      mentions,
      createdAt: new Date()
    };

    post.comments.push(comment);
    await post.save();

    // Populate user data
    await post.populate('comments.user', 'name username avatar');

    const newComment = post.comments[post.comments.length - 1];

    // Create notifications for mentions
    for (const mentionedUserId of mentions) {
      if (mentionedUserId.toString() !== post.user.toString() && 
          mentionedUserId.toString() !== req.user.id) {
        await createNotification({
          type: 'mention',
          fromUser: req.user.id,
          toUser: mentionedUserId,
          post: post._id,
          comment: newComment._id,
          message: `${req.user.name} mentioned you in a comment`
        });
      }
    }

    // Create notification for post owner
    if (post.user.toString() !== req.user.id) {
      await createNotification({
        type: 'comment',
        fromUser: req.user.id,
        toUser: post.user,
        post: post._id,
        comment: newComment._id,
        message: `${req.user.name} commented on your post`
      });
    }

    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});