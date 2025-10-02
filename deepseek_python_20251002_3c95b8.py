# views.py
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.core.cache import cache
from .models import Post, Like, Comment
from .serializers import PostSerializer, CommentSerializer

class PostListCreateView(generics.ListCreateAPIView):
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    
    def get_queryset(self):
        # Try to get from cache first
        cache_key = 'recent_posts'
        posts = cache.get(cache_key)
        
        if not posts:
            posts = Post.objects.all().select_related('user').prefetch_related('like_set', 'comment_set')[:20]
            cache.set(cache_key, posts, 300)  # Cache for 5 minutes
        
        return posts
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        # Invalidate cache when new post is created
        cache.delete('recent_posts')

class LikePostView(generics.CreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, post_id):
        post = Post.objects.get(id=post_id)
        like, created = Like.objects.get_or_create(
            user=request.user,
            post=post
        )
        
        if not created:
            like.delete()
            return Response({'liked': False})
        
        return Response({'liked': True})