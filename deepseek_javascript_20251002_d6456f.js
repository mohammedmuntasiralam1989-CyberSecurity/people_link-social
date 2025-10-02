// graphql/schema.js
import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
    bio: String
    isVerified: Boolean!
    createdAt: String!
  }

  type Post {
    id: ID!
    content: String!
    imageUrl: String
    user: User!
    likes: [Like!]!
    comments: [Comment!]!
    likesCount: Int!
    commentsCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type Comment {
    id: ID!
    content: String!
    user: User!
    createdAt: String!
  }

  type Like {
    id: ID!
    user: User!
    createdAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Query {
    # Posts queries
    posts(page: Int, limit: Int): PostFeed!
    post(id: ID!): Post
    userPosts(userId: ID!): [Post!]!
    
    # User queries
    me: User
    user(id: ID!): User
    searchUsers(query: String!): [User!]!
  }

  type Mutation {
    # Auth mutations
    register(name: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    loginWithOTP(email: String!): Boolean!
    verifyOTP(email: String!, otp: String!): AuthPayload!
    
    # Post mutations
    createPost(content: String!, imageUrl: String): Post!
    deletePost(id: ID!): Boolean!
    likePost(postId: ID!): Boolean!
    unlikePost(postId: ID!): Boolean!
    addComment(postId: ID!, content: String!): Comment!
    
    # User mutations
    updateProfile(name: String, bio: String, avatar: String): User!
    followUser(userId: ID!): Boolean!
    unfollowUser(userId: ID!): Boolean!
  }

  type PostFeed {
    posts: [Post!]!
    total: Int!
    page: Int!
    pages: Int!
  }
`;

// graphql/resolvers.js
export const resolvers = {
  Query: {
    posts: async (_, { page = 1, limit = 10 }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      const skip = (page - 1) * limit;
      const posts = await Post.find()
        .populate('user')
        .populate('comments.user')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await Post.countDocuments();
      
      return {
        posts,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    },
    
    me: async (_, __, { user }) => {
      if (!user) throw new Error('Authentication required');
      return await User.findById(user.id);
    }
  },

  Mutation: {
    register: async (_, { name, email, password }) => {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('User already exists');
      }

      const user = new User({
        name,
        email,
        password: await hashPassword(password)
      });

      await user.save();

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        token,
        user
      };
    },

    createPost: async (_, { content, imageUrl }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      const post = new Post({
        content,
        imageUrl,
        user: user.id
      });

      await post.save();
      await post.populate('user');
      
      return post;
    },

    likePost: async (_, { postId }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      const post = await Post.findById(postId);
      if (!post) throw new Error('Post not found');

      const existingLike = post.likes.find(
        like => like.user.toString() === user.id
      );

      if (existingLike) {
        throw new Error('Post already liked');
      }

      post.likes.push({ user: user.id });
      await post.save();
      
      return true;
    }
  },

  Post: {
    likesCount: (post) => post.likes.length,
    commentsCount: (post) => post.comments.length
  }
};