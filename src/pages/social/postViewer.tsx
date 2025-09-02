// Hooks 
import { useParams } from "react-router-dom"
import usePosts from "../../hooks/usePosts";


export default function PostViewer() {

    // Hooks 
    const { id } = useParams<{ id: string }>();
    const { post, replies } = usePosts(id ?? "")

    return (
        <div>
            <p>{post?.id}</p>
            <p>{post?.username}</p>
          {replies?.map((reply : any) => (
            <div key={reply.id}>
                <p>{reply.username}</p>
                <p>{reply.text}</p>
            </div>
            ))}

        </div>
    )
}