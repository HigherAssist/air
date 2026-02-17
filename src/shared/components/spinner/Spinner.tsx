const Spinner = () => {
  return (
    <div className="flex justify-center items-center h-screen" role="status">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-BlueLagoon"></div>
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;
