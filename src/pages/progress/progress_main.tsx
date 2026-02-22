import crownImg from "../../assets/Rank2-CCOkr3g2.png"

const Progress = () => {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-4 color-bg">
      <img src={crownImg} alt="" className="w-36 h-36 object-contain" />
      <h1 className="text-2xl font-bold color-txt-main">Under Construction</h1>
      <p className="color-txt-sub text-base">Progress tracking is being rebuilt. Check back soon.</p>
    </div>
  );
}

export default Progress;
