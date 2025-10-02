<?php
// database/migrations/2023_01_01_create_users_table.php
Schema::create('users', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('email')->unique();
    $table->string('password');
    $table->text('bio')->nullable();
    $table->string('profile_picture')->nullable();
    $table->boolean('is_verified')->default(false);
    $table->rememberToken();
    $table->timestamps();
});

Schema::create('posts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->onDelete('cascade');
    $table->text('content');
    $table->string('image')->nullable();
    $table->timestamps();
});

// app/Models/User.php
<?php
namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use Notifiable;
    
    protected $fillable = [
        'name', 'email', 'password', 'bio', 'profile_picture', 'is_verified'
    ];
    
    protected $hidden = [
        'password', 'remember_token',
    ];
    
    public function posts()
    {
        return $this->hasMany(Post::class);
    }
    
    public function likes()
    {
        return $this->hasMany(Like::class);
    }
}

// app/Http/Controllers/PostController.php
<?php
namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\Like;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

class PostController extends Controller
{
    public function index()
    {
        // Cache posts for 5 minutes
        $posts = Cache::remember('recent_posts', 300, function () {
            return Post::with(['user', 'likes', 'comments'])
                ->latest()
                ->take(20)
                ->get();
        });
        
        return response()->json($posts);
    }
    
    public function store(Request $request)
    {
        $request->validate([
            'content' => 'required|string|max:1000',
            'image' => 'nullable|image|max:2048'
        ]);
        
        $post = new Post();
        $post->user_id = auth()->id();
        $post->content = $request->content;
        
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('posts', 's3');
            $post->image = Storage::disk('s3')->url($path);
        }
        
        $post->save();
        
        // Clear cache
        Cache::forget('recent_posts');
        
        return response()->json($post->load('user'), 201);
    }
    
    public function like($id)
    {
        $post = Post::findOrFail($id);
        $like = $post->likes()->where('user_id', auth()->id())->first();
        
        if ($like) {
            $like->delete();
            return response()->json(['liked' => false]);
        }
        
        $post->likes()->create(['user_id' => auth()->id()]);
        return response()->json(['liked' => true]);
    }
}